// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Dynamic Content Translation API
 * =============================================
 * Runtime translation of work order descriptions, part names, and other
 * database content to support multilingual plant workforces.
 * Uses google-translate-api-x with a SQLite translation cache to avoid
 * redundant API calls for repeated strings.
 * Mounted at /api/translate in server/index.js.
 *
 * ENDPOINTS:
 *   POST /         Translate a single text string
 *                  Body: { text, targetLang }  (e.g. targetLang: 'es', 'fr', 'pt', 'zh')
 *                  Returns: { translated, fromCache, lang }
 *   POST /batch    Translate multiple strings in one request
 *                  Body: { texts: string[], targetLang }
 *                  Returns: { results: [{ original, translated, fromCache }] }
 *   GET  /stats    Cache statistics: total entries, hit rate, top languages
 *
 * CACHE STRATEGY: Translations are stored in a dedicated SQLite database (translationDB).
 *   Cache key = SHA-256(text.trim().toLowerCase() + '|' + lang).
 *   Cache hit rate typically >90% for recurring maintenance content (status labels, descriptions).
 *
 * GLOSSARY: A plant-specific glossary (glossary.js) is applied before sending to Google Translate.
 *   Technical terms (e.g. "CIP", "pasteurizer", "LOTO") are pre-substituted with their
 *   standard equivalents to prevent mistranslation of industry-specific vocabulary.
 *
 * SUPPORTED LANGUAGES: All languages supported by Google Translate (100+).
 *   Most common in Trier OS deployments: es (Spanish), fr (French), pt (Portuguese),
 *   zh (Chinese Simplified), vi (Vietnamese), so (Somali).
 */
const express   = require('express');
const router    = express.Router();
const crypto    = require('crypto');
const translate = require('google-translate-api-x'); // hoisted — not lazy
const cache     = require('../translationDB');
const glossary  = require('../glossary');

// ── Hash: used only for the server-side DB cache key ─────────────────────────
function hash(text, lang) {
    return crypto
        .createHash('sha256')
        .update(text.trim().toLowerCase() + '|' + lang)
        .digest('hex')
        .slice(0, 16);
}

// ── Language code aliases → Google Translate ISO codes ───────────────────────
// google-translate-api-x rejects short codes for languages that require a region tag.
const LANG_ALIAS = { zh: 'zh-CN', 'zh-hans': 'zh-CN', 'zh-hant': 'zh-TW' };

// ── Core translate (single string, DB cache-first) ────────────────────────────
async function translateOne(text, lang) {
    if (!text || typeof text !== 'string' || !text.trim()) return text;
    if (lang === 'en') return text;
    lang = LANG_ALIAS[lang] || lang; // normalize before cache key + provider call

    const h   = hash(text, lang);
    const hit = cache.get(h, lang);
    if (hit !== null) return hit;

    const { protected: prot, map } = glossary.protect(text);

    try {
        const result   = await translate(prot, { to: lang });
        const restored = glossary.restore(result.text, map);
        cache.set(h, lang, restored);
        cache.audit(h, lang, text);
        return restored;
    } catch (err) {
        console.error(`[translate] ${lang} — ${err.message}`);
        return text; // silent fallback — never crash the UI
    }
}

// ── Async route wrapper for Express 4 ────────────────────────────────────────
// Express 4 does NOT catch unhandled rejections in async handlers.
// This wrapper ensures any thrown error is forwarded to next(err) so Express
// sends a proper 500 JSON response instead of hanging or sending an empty body.
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── POST /api/translate ───────────────────────────────────────────────────────
// Body:    { texts: string[], lang: string }
// Returns: { results: { [originalText]: translatedString } }
// NOTE: results are keyed by the original text (not a hash) so the client
//       doesn't need crypto.subtle to match keys — works on HTTP LAN too.
router.post('/', asyncRoute(async (req, res) => {
    const { texts, lang } = req.body || {};
    if (!Array.isArray(texts) || !lang) {
        return res.status(400).json({ error: 'texts (array) and lang (string) required' });
    }

    const results = {};

    if (lang === 'en') {
        texts.forEach(t => { results[t] = t; });
        return res.json({ results });
    }

    // Deduplicate by text value; process in chunks of 50
    const unique  = [...new Set(texts.filter(t => t && typeof t === 'string'))];
    const CHUNK   = 50;

    for (let i = 0; i < unique.length; i += CHUNK) {
        await Promise.all(
            unique.slice(i, i + CHUNK).map(async (text) => {
                results[text] = await translateOne(text, lang);
            })
        );
    }

    res.json({ results });
}));

// ── POST /api/translate/batch ─────────────────────────────────────────────────
// Body:    { records: [{ id, fields: { fieldName: text } }], lang }
// Returns: { records: [{ id, fields: { fieldName: translated } }] }
router.post('/batch', asyncRoute(async (req, res) => {
    const { records, lang } = req.body || {};
    if (!Array.isArray(records) || !lang) {
        return res.status(400).json({ error: 'records (array) and lang (string) required' });
    }

    const allTexts = new Set();
    for (const rec of records) {
        for (const val of Object.values(rec.fields || {})) {
            if (val && typeof val === 'string') allTexts.add(val);
        }
    }

    const translated = {};
    await Promise.all(
        [...allTexts].map(async (t) => { translated[t] = await translateOne(t, lang); })
    );

    res.json({
        records: records.map(rec => ({
            id: rec.id,
            fields: Object.fromEntries(
                Object.entries(rec.fields || {}).map(([k, v]) => [
                    k,
                    (v && typeof v === 'string' && translated[v]) ? translated[v] : v
                ])
            ),
        })),
    });
}));

// ── GET /api/translate/stats ──────────────────────────────────────────────────
router.get('/stats', (req, res) => {
    try {
        res.json(cache.stats());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
module.exports.translateOne = translateOne;
