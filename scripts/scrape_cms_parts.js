// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * scripts/scrape_cms_parts.js
 * ============================
 * Scrapes CMS Engineered Products dairy/industrial parts catalog from their
 * GitHub-hosted HTML tables and imports into mfg_master.db.
 *
 * Source repo: https://github.com/schollen1970/cms-tables-with-text
 * Each product slug maps to a raw HTML file containing a parts table.
 * Table data is loaded client-side from GitHub — we fetch GitHub directly,
 * no browser/JS rendering required.
 *
 * Inserts into:
 *   MasterParts         — canonical part record (manufacturer, desc, price)
 *   OEMCrossReference   — cross-ref entries (Tri-Clover #, Alfa Laval #, etc.)
 *
 * Usage:
 *   node scripts/scrape_cms_parts.js               # full run
 *   node scripts/scrape_cms_parts.js --dry-run      # parse only, no DB writes
 *   node scripts/scrape_cms_parts.js --limit=3      # test first 3 slugs only
 *   node scripts/scrape_cms_parts.js --slug=fristam-centrifugal-repl-pump-parts
 */

'use strict';
const axios   = require('axios');
const Database = require('better-sqlite3');
const path    = require('path');

const GITHUB_API  = 'https://api.github.com/repos/schollen1970/cms-tables-with-text/contents/';
const GITHUB_RAW  = 'https://raw.githubusercontent.com/schollen1970/cms-tables-with-text/main';
const DB_PATH     = path.join(__dirname, '../data/mfg_master.db');
const DELAY_MS    = 600; // polite crawl delay between GitHub fetches

// ── CLI args ──────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const LIMIT     = (() => { const a = args.find(a => a.startsWith('--limit=')); return a ? parseInt(a.split('=')[1]) : null; })();
const SINGLE    = (() => { const a = args.find(a => a.startsWith('--slug='));  return a ? a.split('=')[1] : null; })();

// ── Pages that are info/marketing, not parts tables ──────────────────────────
const SKIP_SLUGS = new Set([
    'about-us', 'contact-us', 'manufacturers', 'miscellaneous-products',
    'specials-close-outs', 'custom-fabrications', 'crossover-ladders',
    'corrosion-resistant-stainless-steel-roller-conveyor',
    'stainless-steel-platform-trucks',
    'stainless-steel-serrated-deck-adjust-height-ergonomic-work-platform',
    'stainless-steel-serrated-deck-adjust-height-ergonomic-worker-steps',
    'exotic-alloy-pipe-tube-and-fittings',
    'loc-line-modular-hose-system',
]);

// ── Manufacturer inference ────────────────────────────────────────────────────
function inferManufacturer(slug, brandCol) {
    if (brandCol && brandCol.length > 0 && !/^\s*$/.test(brandCol)) return brandCol;
    if (/fristam/.test(slug))          return 'Fristam';
    if (/waukesha/.test(slug))         return 'Waukesha Cherry-Burrell';
    if (/tuchenhagen/.test(slug))      return 'Tuchenhagen';
    if (/evergreen-filler/.test(slug)) return 'Evergreen';
    if (/contherm/.test(slug))         return 'Alfa Laval';
    if (/alfa-laval/.test(slug))       return 'Alfa Laval';
    if (/tri-clover/.test(slug))       return 'Tri-Clover';
    if (/apv|gaulin/.test(slug))       return 'APV Gaulin';
    if (/aro|ingersoll/.test(slug))    return 'ARO / Ingersoll-Rand';
    if (/wilden/.test(slug))           return 'Wilden';
    if (/yamada/.test(slug))           return 'Yamada';
    if (/lmi|milton-roy/.test(slug))   return 'LMI / Milton Roy';
    if (/fisher/.test(slug))           return 'Fisher Controls';
    if (/dorr-oliver/.test(slug))      return 'Dorr-Oliver';
    if (/hills-mccanna/.test(slug))    return 'Hills-McCanna';
    if (/saunders|gemu|aquasyn/.test(slug)) return 'ITT Saunders / GEMU';
    if (/667-actuator/.test(slug))     return 'Tri-Clover';
    if (/657-actuator/.test(slug))     return 'Tri-Clover';
    return 'CMS Engineered Products';
}

function inferCategory(slug) {
    if (/pump/.test(slug))                     return 'MECHANICAL';
    if (/valve|actuator/.test(slug))            return 'VALVES';
    if (/diaphragm/.test(slug))                return 'VALVES';
    if (/gasket|o-ring|seal|clamp/.test(slug)) return 'SEALS';
    if (/filler/.test(slug))                    return 'SEALS';
    if (/heat-exchanger|contherm/.test(slug))  return 'SEALS';
    if (/hose|tubing|connector|expansion/.test(slug)) return 'FLUID';
    if (/filter|strainer|screen/.test(slug))   return 'FILTERS';
    if (/breather|vent|muffler/.test(slug))    return 'PNEUMATICS';
    if (/mechanical-seal/.test(slug))          return 'SEALS';
    if (/check-valve|butterfly/.test(slug))    return 'VALVES';
    if (/control-valve|fisher/.test(slug))     return 'VALVES';
    if (/conveyor/.test(slug))                 return 'MECHANICAL';
    if (/sight-glass/.test(slug))              return 'FLUID';
    if (/pipe|fitting|flange/.test(slug))      return 'HARDWARE';
    if (/silicone|ptfe|pfa|rubber/.test(slug)) return 'SEALS';
    return 'MECHANICAL';
}

function inferEquipmentTypes(slug) {
    const types = [];
    if (/centrifugal-pump/.test(slug))         types.push('CENTRIFUGAL_PUMP');
    if (/rotary-lobe-pump/.test(slug))         types.push('ROTARY_LOBE_PUMP');
    if (/filler/.test(slug))                   types.push('FILLER');
    if (/heat-exchanger|contherm/.test(slug))  types.push('HTST_PASTEURIZER');
    if (/homog/.test(slug))                    types.push('HOMOGENIZER');
    if (/valve/.test(slug))                    types.push('MIX_PROOF_VALVE');
    if (/waukesha/.test(slug))                 types.push('ROTARY_LOBE_PUMP');
    return types.join(',') || null;
}

// ── HTML parsing ──────────────────────────────────────────────────────────────
function stripTags(html) {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseCells(rowHtml) {
    return [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(m => stripTags(m[1]));
}

function parseTableRows(html) {
    return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map(m => parseCells(m[1]))
        .filter(cells => cells.length >= 2 && cells.some(c => c.length > 0));
}

function parsePrice(str) {
    if (!str) return null;
    const m = str.match(/\$?\s*([\d,]+\.?\d*)/);
    return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

// ── Column detection ──────────────────────────────────────────────────────────
// Returns descriptor for how to interpret each column
function detectColumns(headerCells) {
    const norm = headerCells.map(c => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const map = { partNum: -1, desc: -1, brand: -1, price: -1, xrefs: [] };

    for (let i = 0; i < norm.length; i++) {
        const c = norm[i];
        if (map.partNum < 0 && (c.includes('part') || c.includes('oem') || c.includes('item'))) {
            map.partNum = i;
        } else if (map.desc < 0 && (c.includes('desc') || c.includes('descr'))) {
            map.desc = i;
        } else if (map.price < 0 && (c.includes('cost') || c.includes('price') || c.includes('usd'))) {
            map.price = i;
        } else if (c.includes('triclover') || c.includes('alfalaval') || c.includes('aptcrepaco') || c.includes('xref') || c.includes('cross')) {
            map.xrefs.push({ col: i, label: headerCells[i] });
        } else if (i > 0 && i < norm.length - 1 && map.brand < 0 && c.length < 20) {
            // Middle unlabeled column is usually brand name
            map.brand = i;
        }
    }

    // Fallback for simple 3-col tables: part | desc | price
    if (map.partNum < 0) map.partNum = 0;
    if (map.desc < 0)    map.desc    = 1;
    if (map.price < 0 && headerCells.length >= 3) map.price = headerCells.length - 1;

    return map;
}

// ── MasterPartID generation ───────────────────────────────────────────────────
function makeMasterPartID(manufacturer, partNum) {
    const mfg = manufacturer.replace(/[^A-Z0-9]/gi, '').slice(0, 5).toUpperCase();
    const pn  = partNum.replace(/[^A-Z0-9\-_]/gi, '_').replace(/_+/g, '_').slice(0, 50).toUpperCase();
    return `CMS-${mfg}-${pn}`.slice(0, 100);
}

// ── DB helpers ────────────────────────────────────────────────────────────────
function setupDb() {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Ensure OEMCrossReference exists (should already, but be safe)
    db.exec(`
        CREATE TABLE IF NOT EXISTS OEMCrossReference (
            CrossRefID     INTEGER PRIMARY KEY AUTOINCREMENT,
            MasterPartID   TEXT NOT NULL,
            OEMManufacturer TEXT NOT NULL,
            OEMPartNumber  TEXT NOT NULL,
            Notes          TEXT,
            CreatedAt      TEXT NOT NULL,
            CreatedBy      TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_oem_xref_unique
            ON OEMCrossReference(MasterPartID, OEMManufacturer, OEMPartNumber);
    `);

    const insertPart = db.prepare(`
        INSERT OR IGNORE INTO MasterParts
            (MasterPartID, Description, StandardizedName, Manufacturer, Category, SubCategory,
             UOM, TypicalPriceMin, EquipmentTypes, Tags)
        VALUES (?, ?, ?, ?, ?, ?, 'EA', ?, ?, ?)
    `);

    const insertXref = db.prepare(`
        INSERT OR IGNORE INTO OEMCrossReference
            (MasterPartID, OEMManufacturer, OEMPartNumber, Notes, CreatedAt, CreatedBy)
        VALUES (?, ?, ?, ?, ?, 'cms_scraper')
    `);

    const checkPart = db.prepare('SELECT 1 FROM MasterParts WHERE MasterPartID = ? LIMIT 1');

    return { db, insertPart, insertXref, checkPart };
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
const httpClient = axios.create({
    timeout: 15000,
    headers: { 'User-Agent': 'Trier-OS-Scraper/1.0 (industrial maintenance platform)' }
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchSlugs() {
    const res = await httpClient.get(GITHUB_API);
    return res.data
        .filter(f => f.name.endsWith('.html'))
        .map(f => f.name.replace('.html', ''))
        .filter(s => !SKIP_SLUGS.has(s));
}

async function fetchSlugHtml(slug) {
    try {
        const res = await httpClient.get(`${GITHUB_RAW}/${slug}.html`);
        return res.data;
    } catch (e) {
        if (e.response?.status === 404) return null;
        throw e;
    }
}

// ── Process one slug ──────────────────────────────────────────────────────────
function processSlug(slug, html, dbCtx) {
    const { insertPart, insertXref, checkPart } = dbCtx;
    const rows = parseTableRows(html);
    if (rows.length < 2) return { parts: 0, xrefs: 0, skipped: 0 };

    const header  = rows[0];
    const colMap  = detectColumns(header);
    const dataRows = rows.slice(1);

    const manufacturer   = inferManufacturer(slug, '');
    const category       = inferCategory(slug);
    const equipmentTypes = inferEquipmentTypes(slug);
    const tags           = `cms,dairy,${manufacturer.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const subCategory    = slug.split('-').slice(0, 3).join(' ');
    const now            = new Date().toISOString();

    let parts = 0, xrefs = 0, skipped = 0;

    for (const cells of dataRows) {
        const partNum = cells[colMap.partNum] || '';
        const desc    = cells[colMap.desc]    || '';

        // Skip blank or header-like rows
        if (!partNum || partNum.length < 2) { skipped++; continue; }
        // Skip rows that look like sub-headers (all caps label with no numbers)
        if (/^[A-Z\s\-\/]+$/.test(partNum) && !/\d/.test(partNum)) { skipped++; continue; }

        const brandCol = colMap.brand >= 0 ? (cells[colMap.brand] || '') : '';
        const mfr      = inferManufacturer(slug, brandCol);
        const price    = colMap.price >= 0 ? parsePrice(cells[colMap.price]) : null;
        const masterID = makeMasterPartID(mfr, partNum);

        if (!DRY_RUN) {
            insertPart.run(masterID, desc, desc, mfr, category, subCategory, price, equipmentTypes, tags);
        }
        parts++;

        // Primary OEM cross-ref (the part number itself)
        if (!DRY_RUN) {
            insertXref.run(masterID, mfr, partNum, `Source: ${slug}`, now);
        }
        xrefs++;

        // Additional cross-ref columns (Tri-Clover #, Alfa Laval #, etc.)
        for (const xref of colMap.xrefs) {
            const xrefNum = cells[xref.col] || '';
            if (xrefNum && xrefNum.length > 1 && /\d/.test(xrefNum)) {
                if (!DRY_RUN) {
                    insertXref.run(masterID, xref.label, xrefNum, `Cross-ref from ${slug}`, now);
                }
                xrefs++;
            }
        }
    }

    return { parts, xrefs, skipped };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n CMS Engineered Products Scraper`);
    console.log(`  DB: ${DB_PATH}`);
    if (DRY_RUN) console.log('  MODE: DRY RUN — no DB writes\n');

    let slugs;
    if (SINGLE) {
        slugs = [SINGLE];
    } else {
        console.log('  Fetching slug list from GitHub API...');
        slugs = await fetchSlugs();
        console.log(`  Found ${slugs.length} product slugs\n`);
    }

    if (LIMIT) slugs = slugs.slice(0, LIMIT);

    const dbCtx = DRY_RUN ? { insertPart: { run: () => {} }, insertXref: { run: () => {} }, checkPart: { get: () => null } } : setupDb();

    let totalParts = 0, totalXrefs = 0, totalSkipped = 0, failed = 0;

    for (let i = 0; i < slugs.length; i++) {
        const slug = slugs[i];
        process.stdout.write(`  [${String(i+1).padStart(2)}/${slugs.length}] ${slug.padEnd(60)}`);

        try {
            const html = await fetchSlugHtml(slug);
            if (!html) {
                console.log('404 — skipped');
                continue;
            }

            const { parts, xrefs, skipped } = processSlug(slug, html, dbCtx);
            totalParts   += parts;
            totalXrefs   += xrefs;
            totalSkipped += skipped;
            console.log(`${String(parts).padStart(5)} parts  ${String(xrefs).padStart(5)} xrefs`);
        } catch (e) {
            console.log(`ERROR: ${e.message}`);
            failed++;
        }

        if (i < slugs.length - 1) await sleep(DELAY_MS);
    }

    if (!DRY_RUN && dbCtx.db) dbCtx.db.close();

    console.log('\n ─────────────────────────────────────');
    console.log(`  Parts inserted:    ${totalParts.toLocaleString()}`);
    console.log(`  OEM cross-refs:    ${totalXrefs.toLocaleString()}`);
    console.log(`  Rows skipped:      ${totalSkipped.toLocaleString()}`);
    if (failed) console.log(`  Failed slugs:      ${failed}`);
    console.log(`  Done.\n`);
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
