// Copyright © 2026 Trier OS. All Rights Reserved.
// scripts/discover_digital_twins.js
// Discovers 3D CAD models, STEP files, and digital twin URLs for equipment
// types in mfg_master.db using Gemini Flash + HTTP validation.
//
// Sources queried per equipment entry:
//   - GrabCAD (public HTML search)
//   - 3DContentCentral (Dassault public catalog)
//   - TraceParts (public product pages)
//   - OEM direct URLs (manufacturer-specific known patterns)
//   - Gemini inference (for less-common manufacturers)
//
// Usage:
//   node scripts/discover_digital_twins.js [--limit=N] [--dry-run] [--category=PACKAGING]
//   node scripts/discover_digital_twins.js --manufacturer=Grundfos

'use strict';

const https  = require('https');
const http   = require('http');
const path   = require('path');
const fs     = require('fs');
const { randomUUID } = require('crypto');
const Database = require('better-sqlite3');

// ─── CLI args ──────────────────────────────────────────────────────────────
const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);
const DRY_RUN     = !!args['dry-run'];
const LIMIT       = parseInt(args.limit)  || 0;
const CAT_FILTER  = args.category         || null;
const MFR_FILTER  = args.manufacturer     || null;

const GEMINI_KEY = (() => {
    const m = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
    return m ? m[1].trim() : null;
})();
if (!GEMINI_KEY) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

// ─── Known OEM URL patterns (high-confidence, deterministic) ──────────────
// Keyed by lowercase manufacturer name fragment → URL builder function.
const OEM_PATTERNS = {
    'grundfos': (mfr, model) => [
        { url: `https://product-selection.grundfos.com/products/${slug(model)}`, format: 'metadata', conf: 0.7 },
        { url: `https://www.grundfos.com/products/find-product/find-product-details.${slug(model)}.html`, format: 'spec', conf: 0.65 },
    ],
    'skf': (mfr, model) => [
        { url: `https://www.skf.com/us/products/search#q=${encodeURIComponent(model)}&t=products`, format: 'metadata', conf: 0.7 },
    ],
    'alfa laval': (mfr, model) => [
        { url: `https://www.alfalaval.com/products/search/?query=${encodeURIComponent(model)}`, format: 'metadata', conf: 0.65 },
    ],
    'weg': (mfr, model) => [
        { url: `https://www.weg.net/catalog/weg/US/en/Electric-Motors/c/WEG_CATALOG_ELECTRIC_MOTORS?q=${encodeURIComponent(model)}`, format: 'metadata', conf: 0.65 },
    ],
    'siemens': (mfr, model) => [
        { url: `https://mall.industry.siemens.com/mall/en/us/Catalog/Products/search?searchTerm=${encodeURIComponent(model)}`, format: 'metadata', conf: 0.7 },
    ],
    'allen-bradley': (mfr, model) => [
        { url: `https://www.rockwellautomation.com/search#q=${encodeURIComponent(model)}&t=CatalogNumber&numberOfResults=3`, format: 'metadata', conf: 0.7 },
    ],
    'rockwell': (mfr, model) => [
        { url: `https://www.rockwellautomation.com/search#q=${encodeURIComponent(model)}&t=CatalogNumber&numberOfResults=3`, format: 'metadata', conf: 0.7 },
    ],
    'parker': (mfr, model) => [
        { url: `https://www.parker.com/us/en/search.html#q=${encodeURIComponent(model)}&t=All`, format: 'metadata', conf: 0.65 },
    ],
    'schneider': (mfr, model) => [
        { url: `https://www.se.com/us/en/product/find/?text=${encodeURIComponent(model)}`, format: 'metadata', conf: 0.65 },
    ],
    'abb': (mfr, model) => [
        { url: `https://new.abb.com/search#q=${encodeURIComponent(model)}&t=All&panel=productFamily`, format: 'metadata', conf: 0.65 },
    ],
    'tri-clover': (mfr, model) => [
        { url: `https://www.spxflow.com/tri-clover/products/`, format: 'metadata', conf: 0.55 },
    ],
    'waukesha': (mfr, model) => [
        { url: `https://www.spxflow.com/waukesha-cherry-burrell/products/`, format: 'metadata', conf: 0.55 },
    ],
};

// GS1 Digital Link Resolver — free, no key. Resolves GTIN to product metadata/twin links.
// Standard URL: https://id.gs1.org/01/{GTIN}
async function resolveGS1(gtin) {
    if (!gtin || !/^\d{8,14}$/.test(gtin.replace(/\D/g, ''))) return [];
    const cleanGtin = gtin.replace(/\D/g, '').padStart(14, '0');
    const url = `https://id.gs1.org/01/${cleanGtin}`;
    const valid = await validateUrl(url);
    if (!valid) return [];
    return [{ url, format: 'metadata', conf: 0.85, source: 'gs1', submodelType: 'Nameplate' }];
}

// TraceParts — placeholder for developer key integration.
// Register at https://www.traceparts.com/en/solutions/tracepartsonline-developer
// Once key obtained, add TRACEPARTS_API_KEY to .env
async function searchTraceParts(manufacturer, partNumber) {
    const key = process.env.TRACEPARTS_API_KEY;
    if (!key) return [];  // key not yet configured
    try {
        const url = `https://ws.traceparts.com/v1/search?manufacturerName=${encodeURIComponent(manufacturer)}&partNumber=${encodeURIComponent(partNumber)}&apiKey=${key}`;
        const res = await fetchUrl(url);
        if (res.status !== 200) return [];
        const data = JSON.parse(res.body);
        return (data.parts || []).slice(0, 2).map(p => ({
            url: p.viewerUrl || p.downloadUrl, format: 'STEP', conf: 0.88, source: 'traceParts', submodelType: 'Geometry'
        })).filter(p => p.url);
    } catch { return []; }
}

// GrabCAD search — public HTML, parse model links
async function searchGrabCAD(query) {
    const url = `https://grabcad.com/library?query=${encodeURIComponent(query)}&per_page=5`;
    try {
        const res = await fetchUrl(url);
        if (res.status !== 200) return [];
        const slugs = [...res.body.matchAll(/href="\/library\/([\w-]+)"/g)].map(m => m[1]);
        return [...new Set(slugs)].slice(0, 3).map(s => ({
            url: `https://grabcad.com/library/${s}`,
            format: 'STEP/GLTF',
            conf: 0.45,
            source: 'grabcad',
        }));
    } catch { return []; }
}

// Gemini inference — ask for likely twin URLs for less-common manufacturers
async function geminiDiscoverURLs(manufacturer, model, description) {
    const prompt = `You are a technical researcher finding digital twin and 3D CAD resources for industrial equipment.

For this equipment:
  Manufacturer: ${manufacturer}
  Model: ${model}
  Description: ${description}

Return a JSON array of up to 5 candidate URLs from any of these sources:
- Manufacturer's own product/CAD pages (e.g. uniloy.com, grundfos.com, skf.com)
- TraceParts (traceparts.com)
- 3DContentCentral (3dcontentcentral.com)
- GrabCAD (grabcad.com/library)
- BIMobject (bimobject.com)
- IDTA AAS registry

Include the manufacturer's general product page if you can't find a model-specific page.
Set confidence lower (0.4-0.6) for general/category pages, higher (0.7-0.9) for model-specific pages.
Return [] only if you have no idea who the manufacturer is.
Return ONLY valid JSON array, no markdown.

Each entry: { "url": "string", "format": "STEP|IFC|GLTF|metadata|spec|AAS", "confidence": 0.0-1.0, "source": "traceParts|3dcc|grabcad|oem|bimobject|aas", "submodelType": "Geometry|Documentation|Nameplate|LiveData" }`;

    try {
        const body = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        });
        const raw = await callGeminiRaw(body);
        const result = JSON.parse(raw);
        return Array.isArray(result) ? result : [];
    } catch (e) {
        if (process.env.DEBUG_TWINS) console.error('  [Gemini error]', e.message);
        return [];
    }
}

// HTTP HEAD to validate a URL exists
async function validateUrl(url) {
    return new Promise(resolve => {
        try {
            const mod = url.startsWith('https') ? https : http;
            const req = mod.request(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
                resolve(res.statusCode >= 200 && res.statusCode < 400);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(8000, () => { req.destroy(); resolve(false); });
            req.end();
        } catch { resolve(false); }
    });
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
                return resolve(fetchUrl(next));
            }
            let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d }));
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function callGeminiRaw(body) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => {
                if (res.statusCode !== 200) { reject(new Error(`Gemini ${res.statusCode}`)); return; }
                try {
                    const resp = JSON.parse(d);
                    resolve(resp.candidates?.[0]?.content?.parts?.[0]?.text || '[]');
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Gemini timeout')); });
        req.write(body);
        req.end();
    });
}

function slug(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
    const mfgDb = new Database(path.join(__dirname, '..', 'data', 'mfg_master.db'), { readonly: DRY_RUN });
    if (!DRY_RUN) mfgDb.pragma('journal_mode = WAL');

    // Load equipment to process
    let query = 'SELECT EquipmentTypeID, Description, Category, TypicalMakers FROM MasterEquipment WHERE 1=1';
    const params = [];
    if (CAT_FILTER) { query += ' AND Category = ?'; params.push(CAT_FILTER); }
    const allEquipment = mfgDb.prepare(query).all(...params);

    // Filter by manufacturer if specified
    const equipment = allEquipment.filter(eq => {
        if (!MFR_FILTER) return true;
        let makers = [];
        try { makers = JSON.parse(eq.TypicalMakers || '[]'); } catch {}
        return makers.some(m => m.toLowerCase().includes(MFR_FILTER.toLowerCase()));
    });

    const toProcess = LIMIT ? equipment.slice(0, LIMIT) : equipment;
    console.log(`\n=== Digital Twin Discovery ===`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | Equipment to process: ${toProcess.length}\n`);

    const insertTwin = DRY_RUN ? null : mfgDb.prepare(`
        INSERT OR REPLACE INTO CatalogTwins
            (TwinID, RefType, RefID, Source, TwinURL, TwinFormat, SubmodelType, ConfScore, Validated, DiscoveredAt)
        VALUES (?, 'equipment', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    let totalInserted = 0;
    let totalValidated = 0;

    for (let i = 0; i < toProcess.length; i++) {
        const eq = toProcess[i];
        let makers = [];
        try { makers = JSON.parse(eq.TypicalMakers || '[]'); } catch {}
        const mfr = makers[0] || '';
        const model = eq.Description.replace(/^(.*?)\s+(Blow|Filling|Packaging|Extruder|Pump|Motor|Valve|Conveyor|Chiller|Palletizer).*/i, '$1').trim();

        process.stdout.write(`[${i + 1}/${toProcess.length}] ${eq.EquipmentTypeID} (${mfr})... `);

        const candidates = [];

        // 1. OEM direct patterns
        const mfrLower = mfr.toLowerCase();
        for (const [key, builder] of Object.entries(OEM_PATTERNS)) {
            if (mfrLower.includes(key)) {
                const urls = builder(mfr, model);
                urls.forEach(u => candidates.push({ ...u, source: 'oem' }));
                break;
            }
        }

        // 2. GrabCAD search
        const grabResults = await searchGrabCAD(`${mfr} ${model}`);
        candidates.push(...grabResults);

        // 3. Gemini inference (only if we have a real manufacturer)
        if (mfr && mfr.length > 2) {
            const geminiResults = await geminiDiscoverURLs(mfr, model, eq.Description);
            geminiResults.forEach(r => candidates.push({
                url: r.url,
                format: r.format || 'metadata',
                conf: r.confidence || 0.4,
                source: r.source || 'gemini',
                submodelType: r.submodelType || 'Documentation',
            }));
        }

        await sleep(400); // rate limit Gemini

        // Deduplicate by URL
        const seen = new Set();
        const unique = candidates.filter(c => {
            if (!c.url || seen.has(c.url)) return false;
            seen.add(c.url); return true;
        });

        // Validate top candidates (max 3 HTTP checks per equipment)
        let inserted = 0;
        for (const cand of unique.slice(0, 4)) {
            const valid = await validateUrl(cand.url);
            const finalConf = valid ? Math.min(cand.conf + 0.15, 1.0) : cand.conf * 0.6;

            if (DRY_RUN) {
                console.log(`\n  ${valid ? '✓' : '?'} [${cand.source}] ${cand.url} (conf ${finalConf.toFixed(2)})`);
            } else {
                insertTwin.run(
                    randomUUID(),
                    eq.EquipmentTypeID,
                    cand.source,
                    cand.url,
                    cand.format || 'metadata',
                    cand.submodelType || 'Geometry',
                    finalConf,
                    valid ? 1 : 0
                );
                inserted++;
                if (valid) totalValidated++;
            }
        }

        if (!DRY_RUN) {
            totalInserted += inserted;
            console.log(`${inserted} twins stored`);
        } else if (unique.length === 0) {
            console.log('no candidates');
        }
    }

    mfgDb.close();

    console.log(`\n──────────────────────────────────`);
    console.log(`Equipment processed : ${toProcess.length}`);
    if (!DRY_RUN) {
        console.log(`Twin records stored : ${totalInserted}`);
        console.log(`URL-validated       : ${totalValidated}`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
