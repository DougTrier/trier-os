// Copyright © 2026 Trier OS. All Rights Reserved.
// server/services/enrichmentQueue.js
//
// Async semantic enrichment queue for the scan 404 path.
// Decouples Gemini embedding + vector search from the synchronous scan response.
//
// Contract (hard rules from Better Scan Flow.md):
//   - Scan path MUST return before this module does any work.
//   - Enrichment failure (Gemini down, timeout, DB error) is silent — callers never see the error.
//   - Duplicate jobs for the same asset+scan+second window are discarded.
//   - Results are held in-memory for RESULT_TTL_MS and pushed to waiting SSE clients.
//
// Usage (scan.js):
//   const enrichmentQueue = require('../services/enrichmentQueue');
//   const enrichmentId = enrichmentQueue.enqueue({ assetId, scanId, scanTimestamp });
//   // → returns enrichmentId (= scanId), or null if a duplicate job is already in-flight
//
// Client:
//   GET /api/scan/enrichment/:id  (SSE)
//   → receives  data: {"type":"enrichment","enrichmentId":"...","semanticMatch":{...}|null}
//   → stream closes after one event or POLL_TIMEOUT_MS

'use strict';

const RESULT_TTL_MS   = 60_000;  // keep completed results 60s
const JOB_DEDUP_MS    = 5_000;   // clear dedup slot 5s after enqueueing
const GEMINI_TIMEOUT  = 10_000;  // ms — longer than scan path, OK since we're async
const SSE_TIMEOUT_MS  = 12_000;  // close SSE connections after this if no result

// dedup key → timestamp of when job was enqueued
const inFlightEnrichment = new Map();

// enrichmentId → { semanticMatch: {...}|null, completedAt: number }
const enrichmentResults = new Map();

// enrichmentId → Set<res> (SSE response objects waiting for this result)
const sseListeners = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGeminiKey() {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    try {
        const fs   = require('fs');
        const path = require('path');
        const env  = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8');
        return env.match(/GEMINI_API_KEY=(.+)/)?.[1]?.trim() || null;
    } catch { return null; }
}

function completeEnrichment(enrichmentId, semanticMatch) {
    enrichmentResults.set(enrichmentId, { semanticMatch, completedAt: Date.now() });

    // Push to any SSE clients already waiting
    const listeners = sseListeners.get(enrichmentId);
    if (listeners) {
        const payload = JSON.stringify({ type: 'enrichment', enrichmentId, semanticMatch });
        for (const res of listeners) {
            try {
                res.write(`data: ${payload}\n\n`);
                res.end();
            } catch (_) { /* client disconnected — safe to ignore */ }
        }
        sseListeners.delete(enrichmentId);
    }

    // Auto-expire result after TTL
    setTimeout(() => enrichmentResults.delete(enrichmentId), RESULT_TTL_MS);
}

// ── Core enrichment worker ────────────────────────────────────────────────────

async function runEnrichment(assetId, enrichmentId) {
    const GEMINI_KEY = getGeminiKey();
    if (!GEMINI_KEY) { completeEnrichment(enrichmentId, null); return; }

    // 1. Embed the assetId string via Gemini
    const vecEmbed = await new Promise(resolve => {
        const https = require('https');
        const body  = JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text: assetId }] },
            taskType: 'RETRIEVAL_QUERY',
        });
        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path:     `/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_KEY}`,
            method:   'POST',
            headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d).embedding?.values || null); }
                catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(GEMINI_TIMEOUT, () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
    });

    if (!vecEmbed) { completeEnrichment(enrichmentId, null); return; }

    // 2. Vector search in mfg_master.db
    let semanticMatch = null;
    try {
        const path      = require('path');
        const Database  = require('better-sqlite3');
        const sqliteVec = require('sqlite-vec');
        const dataDir   = require('../resolve_data_dir');

        const mfgDb = new Database(path.join(dataDir, 'mfg_master.db'), { readonly: true });
        sqliteVec.load(mfgDb);

        const vecCount = mfgDb.prepare('SELECT COUNT(*) AS n FROM equipment_vec_map').get().n;
        if (vecCount > 0) {
            const queryBuf = Buffer.from(new Float32Array(vecEmbed).buffer);
            const hit = mfgDb.prepare(`
                SELECT m.typeId, v.distance
                FROM equipment_vec v
                JOIN equipment_vec_map m ON m.rowid = v.rowid
                WHERE v.embedding MATCH ? AND k = 1
                ORDER BY v.distance
            `).get(queryBuf);

            if (hit && hit.distance < 1.2) {
                const eq = mfgDb.prepare(
                    'SELECT EquipmentTypeID, Description, Category, TypicalMakers FROM MasterEquipment WHERE EquipmentTypeID = ?'
                ).get(hit.typeId);
                if (eq) {
                    let makers = [];
                    try { makers = JSON.parse(eq.TypicalMakers || '[]'); } catch {}
                    semanticMatch = {
                        id:          eq.EquipmentTypeID,
                        description: eq.Description,
                        category:    eq.Category,
                        primaryMaker: makers[0] || null,
                        similarity:  Math.max(0, Math.round((1 - hit.distance / 2) * 100)),
                    };
                }
            }
        }
        mfgDb.close();
    } catch (_) { /* vector DB unavailable — degrade gracefully */ }

    completeEnrichment(enrichmentId, semanticMatch);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a semantic enrichment job for an unknown assetId.
 * Returns the enrichmentId (= scanId) that the caller can give to the client,
 * or null if a duplicate job is already in-flight for this asset+scan+second.
 * Safe to call from synchronous code — never blocks.
 */
function enqueue({ assetId, scanId, scanTimestamp }) {
    const dedupeKey = `${assetId}:${scanId}:${Math.floor((scanTimestamp || Date.now()) / 1000)}`;

    if (inFlightEnrichment.has(dedupeKey)) return null;

    inFlightEnrichment.set(dedupeKey, Date.now());
    setTimeout(() => inFlightEnrichment.delete(dedupeKey), JOB_DEDUP_MS);

    // setImmediate ensures this runs after the HTTP response is flushed
    setImmediate(() => runEnrichment(assetId, scanId).catch(() => completeEnrichment(scanId, null)));

    return scanId;
}

/**
 * Returns the completed enrichment result for an enrichmentId, or null if not ready yet.
 */
function getResult(enrichmentId) {
    return enrichmentResults.get(enrichmentId) || null;
}

/**
 * Register an SSE response object to receive a push when enrichmentId completes.
 * If the result is already available, writes it immediately and closes the response.
 * Times out and sends null result after SSE_TIMEOUT_MS.
 */
function registerSSEListener(enrichmentId, res) {
    // Already done — send immediately
    const existing = enrichmentResults.get(enrichmentId);
    if (existing) {
        try {
            res.write(`data: ${JSON.stringify({ type: 'enrichment', enrichmentId, semanticMatch: existing.semanticMatch })}\n\n`);
            res.end();
        } catch (_) {}
        return;
    }

    if (!sseListeners.has(enrichmentId)) sseListeners.set(enrichmentId, new Set());
    sseListeners.get(enrichmentId).add(res);

    // Safety timeout — send null result and close if enrichment never finishes
    const timer = setTimeout(() => {
        removeSSEListener(enrichmentId, res);
        try {
            res.write(`data: ${JSON.stringify({ type: 'enrichment', enrichmentId, semanticMatch: null, timedOut: true })}\n\n`);
            res.end();
        } catch (_) {}
    }, SSE_TIMEOUT_MS);

    // Clean up timer if client disconnects early
    res.on('close', () => {
        clearTimeout(timer);
        removeSSEListener(enrichmentId, res);
    });
}

function removeSSEListener(enrichmentId, res) {
    sseListeners.get(enrichmentId)?.delete(res);
}

module.exports = { enqueue, getResult, registerSSEListener, removeSSEListener };
