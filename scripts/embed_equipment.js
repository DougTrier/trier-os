// Copyright © 2026 Trier OS. All Rights Reserved.
// scripts/embed_equipment.js
// Generates Gemini text-embedding-004 vectors for all MasterEquipment entries
// and stores them in the equipment_vec virtual table in mfg_master.db.
// Run after adding new equipment types. Safe to re-run — skips already-embedded entries.
//
// Usage:
//   node scripts/embed_equipment.js [--force]   (--force re-embeds all)

'use strict';

const https   = require('https');
const path    = require('path');
const fs      = require('fs');
const Database    = require('better-sqlite3');
const sqliteVec   = require('sqlite-vec');

const FORCE      = process.argv.includes('--force');
const GEMINI_KEY = (() => {
    const m = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
    return m ? m[1].trim() : null;
})();
if (!GEMINI_KEY) { console.error('GEMINI_API_KEY missing from .env'); process.exit(1); }

// ─── Gemini embedding call ─────────────────────────────────────────────────
// text-embedding-004 returns 768-dimensional vectors.
function embedText(text) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text }] },
            taskType: 'RETRIEVAL_DOCUMENT',
        });
        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_KEY}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => {
                if (res.statusCode !== 200) { reject(new Error(`Gemini embed HTTP ${res.statusCode}: ${d.substring(0, 200)}`)); return; }
                try {
                    const resp = JSON.parse(d);
                    resolve(resp.embedding.values); // float[]
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Gemini embed timeout')); });
        req.write(body);
        req.end();
    });
}

async function embedWithRetry(text, retries = 3) {
    for (let i = 1; i <= retries; i++) {
        try { return await embedText(text); }
        catch (e) {
            if (i < retries && (e.message.includes('429') || e.message.includes('503') || e.message.includes('timeout'))) {
                const wait = i * 3000;
                process.stdout.write(` [retry ${i}, ${wait/1000}s]`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            throw e;
        }
    }
}

function buildInputText(eq) {
    // Enrich the embedding input with category + common failure modes for better retrieval
    let makers = [];
    try { makers = JSON.parse(eq.TypicalMakers || '[]'); } catch {}
    let failures = [];
    try { failures = JSON.parse(eq.CommonFailureModes || '[]'); } catch {}
    const parts = [
        eq.Description,
        eq.Category ? `Category: ${eq.Category}` : '',
        makers.length ? `Manufacturer: ${makers.join(', ')}` : '',
        failures.length ? `Common issues: ${failures.slice(0, 3).join(', ')}` : '',
    ].filter(Boolean);
    return parts.join('. ');
}

function encodeVector(floatArr) {
    return Buffer.from(new Float32Array(floatArr).buffer);
}

async function main() {
    const db = new Database(path.join(__dirname, '..', 'data', 'mfg_master.db'));
    db.pragma('journal_mode = WAL');
    sqliteVec.load(db);

    // Load all equipment
    const allEq = db.prepare('SELECT EquipmentTypeID, Description, Category, TypicalMakers, CommonFailureModes FROM MasterEquipment').all();

    // Find which typeIds are already embedded
    const embedded = new Set(
        db.prepare('SELECT typeId FROM equipment_vec_map').all().map(r => r.typeId)
    );

    const toEmbed = FORCE ? allEq : allEq.filter(e => !embedded.has(e.EquipmentTypeID));
    console.log(`\n=== Equipment Embeddings ===`);
    console.log(`Total equipment: ${allEq.length} | Already embedded: ${embedded.size} | To embed: ${toEmbed.length}\n`);

    if (toEmbed.length === 0) {
        console.log('All equipment already embedded. Use --force to re-embed.');
        db.close();
        return;
    }

    const insertMap = db.prepare('INSERT OR IGNORE INTO equipment_vec_map(typeId, inputText) VALUES (?, ?)');

    let success = 0, errors = 0;

    for (let i = 0; i < toEmbed.length; i++) {
        const eq = toEmbed[i];
        const inputText = buildInputText(eq);
        process.stdout.write(`[${i + 1}/${toEmbed.length}] ${eq.EquipmentTypeID}... `);

        try {
            const vector = await embedWithRetry(inputText);

            // Insert into map first to get auto-assigned rowid, then use it as a
            // literal in the vec INSERT (sqlite-vec 0.1.9 doesn't accept bound rowid params)
            db.transaction(() => {
                insertMap.run(eq.EquipmentTypeID, inputText);
                const { id } = db.prepare('SELECT last_insert_rowid() AS id').get();
                db.prepare(`INSERT OR REPLACE INTO equipment_vec(rowid, embedding) VALUES (${id}, ?)`).run(encodeVector(vector));
            })();

            console.log('ok');
            success++;
        } catch (e) {
            console.log(`ERR: ${e.message}`);
            errors++;
        }

        // Stay under Gemini embedding rate limit (1500 req/min free tier)
        await new Promise(r => setTimeout(r, 100));
    }

    db.close();
    console.log(`\n──────────────────────────────────`);
    console.log(`Embedded : ${success}`);
    console.log(`Errors   : ${errors}`);
    console.log(`Total    : ${allEq.length} equipment types now searchable by similarity`);
}

main().catch(e => { console.error(e); process.exit(1); });
