// Copyright © 2026 Trier OS. All Rights Reserved.
// scripts/gemini_catalog_scraper.js
// Gemini-powered catalog scraper: crawls equipment/parts sites, uses Gemini Flash
// to extract structured data, and inserts into mfg_master.db.
//
// Usage:
//   node scripts/gemini_catalog_scraper.js --site=internationalpack [--limit=N] [--dry-run] [--category=<slug>]
//   node scripts/gemini_catalog_scraper.js --list-sites

'use strict';

const https = require('https');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');
const Database = require('better-sqlite3');

// ─── CLI args ──────────────────────────────────────────────────────────────
const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);

const DRY_RUN     = !!args['dry-run'];
const SITE_KEY    = args.site || null;
const LIMIT       = parseInt(args.limit) || 0;
const CAT_FILTER  = args.category || null;
const LIST_SITES  = !!args['list-sites'];
const FORCE       = !!args['force'];

// ─── Scraper state (tracks completed sites + processed URLs) ───────────────
const STATE_FILE = path.join(__dirname, 'scraper_state.json');

function loadState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
        return { sites: {} };
    }
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function markUrlProcessed(state, siteKey, url) {
    state.sites[siteKey] = state.sites[siteKey] || { status: 'in_progress', processedUrls: [], runs: [] };
    if (!state.sites[siteKey].processedUrls.includes(url)) {
        state.sites[siteKey].processedUrls.push(url);
    }
    saveState(state);
}

function markSiteComplete(state, siteKey, stats) {
    state.sites[siteKey].status = 'complete';
    state.sites[siteKey].completedAt = new Date().toISOString();
    state.sites[siteKey].runs.push({ ...stats, completedAt: new Date().toISOString() });
    saveState(state);
    console.log(`\nState saved → scripts/scraper_state.json`);
}

const GEMINI_API_KEY = (() => {
    // Load from .env file
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return null;
    const match = fs.readFileSync(envPath, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
    return match ? match[1].trim() : null;
})();

if (!GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY not found in .env');
    process.exit(1);
}

// ─── Site configurations ───────────────────────────────────────────────────

const SITES = {
    internationalpack: {
        name: 'International Packaging Company',
        baseUrl: 'https://www.internationalpack.com',
        // Category pages to crawl for product links
        categoryUrls: [
            '/product-category/blow-molding-machines/',
            '/product-category/blow-molding-machines/continuous-extrusion/',
            '/product-category/blow-molding-machines/reciprocating-screw/',
            '/product-category/blow-molding-machines/accumulator-head/',
            '/product-category/blow-molding-machines/injection-blow/',
            '/product-category/blow-molding-machines/heads/',
            '/product-category/packaging-equipment/',
            '/product-category/packaging-equipment/rotary-filling-machines/',
            '/product-category/packaging-equipment/capping-machines/',
            '/product-category/packaging-equipment/palletizers/',
            '/product-category/packaging-equipment/labelers/',
            '/product-category/packaging-equipment/case-erectors/',
            '/product-category/critical-spare-parts/blow-molding-2/',
            '/product-category/critical-spare-parts/controllers-plc-hmi/',
            '/product-category/injection-molding-machines/',
            '/product-category/extruders/',
            '/product-category/temperature-control-equipment/chillers-air-cooled/',
            '/product-category/temperature-control-equipment/chillers-water-cooled/',
            '/product-category/air-compressors/',
            '/product-category/granulators-and-shredders/',
        ],
        // Regex to match product detail pages
        productUrlPattern: /\/product\/[^\/]+\//,
        // Target data type for MasterEquipment entries
        targetType: 'equipment',
        // Gemini extraction prompt template
        extractionPrompt: (text) => `
You are extracting equipment specification data from a used industrial machinery listing page.
Return ONLY valid JSON — no markdown, no explanation.

Extract this information:
{
  "manufacturer": "company name (e.g. Bekum, Uniloy, Graham)",
  "model": "model number or name",
  "equipmentType": "one of: BLOW_MOLDER, INJECTION_MOLDER, EXTRUDER, FILLER, CAPPER, PALLETIZER, LABELER, CASE_ERECTOR, GRANULATOR, CHILLER, AIR_COMPRESSOR, PROCESSING_HEAD, CONVEYOR, OTHER",
  "category": "one of: PACKAGING, PRODUCTION, UTILITY, FACILITY",
  "description": "clean one-line description, max 100 chars",
  "specifications": {
    "include any of these if mentioned": {
      "voltage": number,
      "phase": number,
      "hz": number,
      "hp": number,
      "kw": number,
      "amps": number,
      "clamp_force_ton": number,
      "extruder_dia_mm": number or array,
      "shot_capacity_g": number,
      "output_lb_hr": number,
      "max_container_oz": number,
      "heads": number,
      "speed_cpm": number,
      "year": number,
      "controller": "brand/model",
      "material": "HDPE,PET,etc"
    }
  },
  "partNumber": "OEM part number if this is a spare part (null if machine listing)",
  "priceUSD": number or null,
  "skip": true/false  (set true if this is not a real machine/part — e.g. a navigation page)
}

Page content:
${text.substring(0, 6000)}
`,
    },

    // ── Placeholder for future sites ────────────────────────────────────────
    // Add new sites here as config entries following the same shape.
};

if (LIST_SITES) {
    console.log('Available sites:');
    Object.entries(SITES).forEach(([k, s]) => console.log(` ${k} — ${s.name}`));
    process.exit(0);
}

if (!SITE_KEY || !SITES[SITE_KEY]) {
    console.error(`Site "${SITE_KEY}" not found. Use --list-sites to see options.`);
    process.exit(1);
}

const SITE = SITES[SITE_KEY];

// ─── HTTP helpers ──────────────────────────────────────────────────────────

function fetchUrl(url, retries = 2) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            },
        }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const next = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : SITE.baseUrl + res.headers.location;
                return resolve(fetchUrl(next, retries));
            }
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', err => {
            if (retries > 0) return resolve(fetchUrl(url, retries - 1));
            reject(err);
        });
        req.setTimeout(15000, () => {
            req.destroy();
            if (retries > 0) return resolve(fetchUrl(url, retries - 1));
            reject(new Error('timeout: ' + url));
        });
    });
}

function htmlToText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── Gemini extraction ─────────────────────────────────────────────────────

async function callGemini(prompt, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const result = await callGeminiOnce(prompt);
            return result;
        } catch (e) {
            if (attempt < retries && (e.message.includes('503') || e.message.includes('429') || e.message.includes('timeout'))) {
                const delay = attempt * 4000;
                process.stdout.write(` [retry ${attempt}, wait ${delay/1000}s]`);
                await sleep(delay);
                continue;
            }
            throw e;
        }
    }
}

function callGeminiOnce(prompt) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        });

        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Gemini HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                    return;
                }
                try {
                    const resp = JSON.parse(data);
                    const text = resp.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    resolve(JSON.parse(text));
                } catch (e) {
                    reject(new Error('Gemini parse error: ' + e.message));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Gemini timeout')); });
        req.write(body);
        req.end();
    });
}

// ─── Slug / ID generation ──────────────────────────────────────────────────

function makeEquipmentTypeID(mfr, model, equipType) {
    const safe = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const mfrCode = safe(mfr).substring(0, 10);
    const modelCode = safe(model).substring(0, 15);
    return `IPC_${mfrCode}_${modelCode}`.substring(0, 60);
}

function makePartID(mfr, partNum) {
    const safe = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return `IPC-${safe(mfr).substring(0,8)}-${safe(partNum).substring(0,30)}`.substring(0, 100);
}

// ─── DB write ──────────────────────────────────────────────────────────────

function openDb() {
    const db = new Database(path.join(__dirname, '..', 'data', 'mfg_master.db'));
    db.pragma('journal_mode = WAL');
    return db;
}

let db = null;
const insertEquipment = () => db.prepare(`
    INSERT OR IGNORE INTO MasterEquipment
        (EquipmentTypeID, Description, Category, TypicalMakers, PMIntervalDays,
         CommonFailureModes, ExpectedMTBF_Hours, ExpectedMTTR_Hours,
         UsefulLifeYears, TypicalWarrantyMonths, Specifications)
    VALUES (@EquipmentTypeID, @Description, @Category, @TypicalMakers, @PMIntervalDays,
            @CommonFailureModes, @ExpectedMTBF_Hours, @ExpectedMTTR_Hours,
            @UsefulLifeYears, @TypicalWarrantyMonths, @Specifications)
`);

const insertPart = () => db.prepare(`
    INSERT OR IGNORE INTO MasterParts
        (MasterPartID, StandardizedName, Description, Manufacturer, Category,
         EquipmentTypes, TypicalPriceMin, TypicalPriceMax, UOM, LeadTimeDays)
    VALUES (@MasterPartID, @StandardizedName, @Description, @Manufacturer, @Category,
            @EquipmentTypes, @TypicalPriceMin, @TypicalPriceMax, @UOM, @LeadTimeDays)
`);

// ─── Crawl + process ───────────────────────────────────────────────────────

async function collectProductUrls() {
    const seen = new Set();
    const allUrls = [];

    const cats = CAT_FILTER
        ? SITE.categoryUrls.filter(u => u.includes(CAT_FILTER))
        : SITE.categoryUrls;

    console.log(`\nCrawling ${cats.length} category pages...`);

    for (const catPath of cats) {
        // Crawl up to 5 pages of pagination per category
        for (let page = 1; page <= 5; page++) {
            const url = SITE.baseUrl + catPath + (page > 1 ? `page/${page}/` : '');
            let res;
            try {
                res = await fetchUrl(url);
            } catch (e) {
                console.warn(`  SKIP ${url}: ${e.message}`);
                break;
            }
            if (res.status === 404) break;

            const links = [...res.body.matchAll(/href="(https:\/\/[^"]+)"/g)]
                .map(m => m[1])
                .filter(l => SITE.productUrlPattern.test(l) && !seen.has(l));

            if (links.length === 0) break; // no more pages

            for (const l of links) {
                if (!seen.has(l)) { seen.add(l); allUrls.push(l); }
            }
            await sleep(300);
        }
        process.stdout.write('.');
    }

    console.log(`\nFound ${allUrls.length} unique product URLs`);
    return allUrls;
}

async function processProduct(url, stmtEq, stmtPart) {
    let res;
    try {
        res = await fetchUrl(url);
    } catch (e) {
        return { url, error: e.message };
    }
    if (res.status !== 200) return { url, error: `HTTP ${res.status}` };

    const text = htmlToText(res.body);
    let extracted;
    try {
        extracted = await callGemini(SITE.extractionPrompt(text));
    } catch (e) {
        return { url, error: 'Gemini: ' + e.message };
    }

    if (extracted.skip) return { url, skipped: true };

    const mfr = (extracted.manufacturer || '').trim();
    const model = (extracted.model || '').trim();
    const desc = (extracted.description || `${mfr} ${model}`).trim().substring(0, 200);

    if (!mfr && !model) return { url, skipped: true, reason: 'no manufacturer/model' };

    if (DRY_RUN) {
        console.log(`\n  [DRY] ${desc}`);
        console.log(`        specs: ${JSON.stringify(extracted.specifications || {}).substring(0, 120)}`);
        return { url, dry: true };
    }

    // Spare part
    if (extracted.partNumber) {
        const partId = makePartID(mfr, extracted.partNumber);
        stmtPart.run({
            MasterPartID: partId,
            StandardizedName: desc,
            Description: desc,
            Manufacturer: mfr,
            Category: 'SPARE_PARTS',
            EquipmentTypes: JSON.stringify([extracted.equipmentType || 'BLOW_MOLDER']),
            TypicalPriceMin: extracted.priceUSD || null,
            TypicalPriceMax: extracted.priceUSD || null,
            UOM: 'EA',
            LeadTimeDays: null,
        });
        return { url, type: 'part', id: partId, desc };
    }

    // Equipment
    const typeId = makeEquipmentTypeID(mfr, model, extracted.equipmentType);
    stmtEq.run({
        EquipmentTypeID: typeId,
        Description: desc,
        Category: extracted.category || 'PRODUCTION',
        TypicalMakers: JSON.stringify(mfr ? [mfr] : []),
        PMIntervalDays: 90,
        CommonFailureModes: JSON.stringify([]),
        ExpectedMTBF_Hours: 3000,
        ExpectedMTTR_Hours: 4.0,
        UsefulLifeYears: 20,
        TypicalWarrantyMonths: 0,
        Specifications: JSON.stringify(extracted.specifications || {}),
    });
    return { url, type: 'equipment', id: typeId, desc };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n=== Gemini Catalog Scraper — ${SITE.name} ===`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | Limit: ${LIMIT || 'none'}`);

    // State check — skip completed sites unless --force
    const state = loadState();
    const siteState = state.sites[SITE_KEY];

    if (!DRY_RUN && siteState?.status === 'complete' && !FORCE) {
        const when = siteState.completedAt ? new Date(siteState.completedAt).toLocaleDateString() : 'previously';
        const lastRun = siteState.runs?.slice(-1)[0] || {};
        console.log(`\n⚠  Site "${SITE_KEY}" was already fully scraped (${when}).`);
        console.log(`   Last run: ${lastRun.eqCount || 0} equipment, ${lastRun.partCount || 0} parts added.`);
        console.log(`   Use --force to re-scrape and add any new listings.\n`);
        process.exit(0);
    }

    const alreadyProcessed = new Set(siteState?.processedUrls || []);
    if (alreadyProcessed.size > 0 && !FORCE) {
        console.log(`Resuming: ${alreadyProcessed.size} URLs already processed — will skip them.`);
    }

    const productUrls = await collectProductUrls();

    // Filter out already-processed URLs (resume support), unless --force
    const pending = FORCE
        ? productUrls
        : productUrls.filter(u => !alreadyProcessed.has(u));

    const toProcess = LIMIT ? pending.slice(0, LIMIT) : pending;

    if (toProcess.length === 0) {
        console.log('\nAll URLs already processed. Use --force to re-run.\n');
        process.exit(0);
    }

    console.log(`\nProcessing ${toProcess.length} pages with Gemini Flash...\n`);

    if (!DRY_RUN) db = openDb();

    const stmtEq   = DRY_RUN ? null : insertEquipment();
    const stmtPart = DRY_RUN ? null : insertPart();

    let eqCount = 0, partCount = 0, skipCount = 0, errCount = 0;

    for (let i = 0; i < toProcess.length; i++) {
        const url = toProcess[i];
        process.stdout.write(`[${i + 1}/${toProcess.length}] `);

        const result = await processProduct(url, stmtEq, stmtPart);

        if (result.error) {
            console.log(`ERR ${url.split('/').slice(-2, -1)[0]}: ${result.error}`);
            errCount++;
        } else if (result.skipped) {
            process.stdout.write('skip\n');
            skipCount++;
        } else if (result.dry) {
            // already printed
        } else if (result.type === 'equipment') {
            console.log(`EQ  ${result.id} — ${result.desc}`);
            eqCount++;
        } else if (result.type === 'part') {
            console.log(`PT  ${result.id} — ${result.desc}`);
            partCount++;
        }

        // Record URL as processed (persists after each page — crash-safe resume)
        if (!DRY_RUN) markUrlProcessed(state, SITE_KEY, url);

        // Rate limit: ~2 req/sec to Gemini, ~1 req/sec to site
        await sleep(600);
    }

    if (!DRY_RUN) db.close();

    const stats = { eqCount, partCount, skipCount, errCount, total: toProcess.length };

    console.log(`\n──────────────────────────────────`);
    console.log(`Equipment added : ${eqCount}`);
    console.log(`Parts added     : ${partCount}`);
    console.log(`Skipped         : ${skipCount}`);
    console.log(`Errors          : ${errCount}`);
    console.log(`Total processed : ${toProcess.length}`);

    // Mark complete only if no limit was set (full run) and not dry run
    if (!DRY_RUN && !LIMIT) {
        markSiteComplete(state, SITE_KEY, stats);
        console.log(`Site "${SITE_KEY}" marked complete. Won't re-scrape unless --force is passed.`);
    } else if (!DRY_RUN) {
        console.log(`Partial run (--limit used). Re-run without --limit to complete and mark done.`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
