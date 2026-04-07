// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Dynamic Translation Engine (Client)
 * ================================================
 * Level-3 runtime translation of database content.
 * Called from the global fetch wrapper in main.jsx AFTER the server
 * response arrives, before the calling component sees the data.
 *
 * FLOW:
 *   fetch('/api/work-orders') → response arrives →
 *   interceptTranslation(url, data, lang) →
 *   IDB cache check → POST /api/translate for misses →
 *   field values replaced in-place → component receives translated data
 */

// ── Field Map ─────────────────────────────────────────────────────────────────
// Add new endpoints here. Key = URL prefix. Value = array of field names.
export const FIELD_MAP = {
    '/api/work-orders':          ['Description', 'Comment', 'StatusLabel'], // Work table: Description, Comment; StatusLabel from WorkStatuses JOIN
    '/api/assets':               ['Description'],                       // Asset table: Description
    '/api/pm-schedules':         ['Description'],                       // Schedule table: Description (normalized from Descript)
    '/api/procedures':           ['Description'],                       // Procedur table: Description (normalized from Descript)
    '/api/parts':                ['Description'],                       // Part table: Description (normalized from Descript)
    '/api/tribal-knowledge':     ['title', 'body', 'tags'],             // tribal_knowledge table: lowercase columns
    '/api/safety-incidents':     ['Title', 'Description', 'RootCause', 'CorrectiveAction'],
    '/api/compliance':           ['Description', 'Notes'],
};

function getFields(url) {
    for (const [prefix, fields] of Object.entries(FIELD_MAP)) {
        if (url.startsWith(prefix)) return fields;
    }
    return null;
}

// ── IDB cache key — plain text-based, no crypto.subtle required ──────────────
// crypto.subtle is only available in secure contexts (HTTPS / localhost).
// Enterprise LAN deployments on http://192.168.x.x would crash with it.
// We use the text itself (truncated) as the key; server returns results keyed
// by original text, so there is no hash mismatch to worry about.
function idbKey(text, lang) {
    // Truncate to 200 chars to keep IDB keys sane for long descriptions
    return `${lang}:${text.trim().slice(0, 200)}`;
}

// ── IndexedDB Cache ───────────────────────────────────────────────────────────
const IDB_NAME  = 'trier_xlat';
const IDB_STORE = 'v1';

let _idb = null;
function openIDB() {
    if (_idb) return Promise.resolve(_idb);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
        req.onsuccess  = e => { _idb = e.target.result; resolve(_idb); };
        req.onerror    = reject;
    });
}

async function idbGet(key) {
    try {
        const db = await openIDB();
        return await new Promise(resolve => {
            const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror   = () => resolve(null);
        });
    } catch { return null; }
}

async function idbSet(key, value) {
    try {
        const db = await openIDB();
        await new Promise(resolve => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = resolve;
            tx.onerror    = resolve;
        });
    } catch { /* non-fatal */ }
}

// ── Batch translate: IDB → server → fallback ─────────────────────────────────
async function batchTranslate(texts, lang) {
    if (!texts.length || lang === 'en') {
        return Object.fromEntries(texts.map(t => [t, t]));
    }

    const results = {};
    const missing = []; // texts not in IDB

    for (const text of texts) {
        const cached = await idbGet(idbKey(text, lang));
        if (cached !== null) {
            results[text] = cached;
        } else {
            missing.push(text);
        }
    }

    if (missing.length > 0) {
        try {
            const res  = await fetch('/api/translate', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ texts: missing, lang }),
            });
            if (!res.ok) throw new Error(`translate ${res.status}`);
            const data = await res.json();

            await Promise.all(
                missing.map(async (text) => {
                    // Server returns results keyed by original text
                    const translated = data.results?.[text] ?? text;
                    results[text] = translated;
                    await idbSet(idbKey(text, lang), translated);
                })
            );
        } catch {
            // Offline or server error — show original text, do not crash
            missing.forEach(text => { results[text] = text; });
        }
    }

    return results;
}

// ── Deep-walk object, collect translatable strings, inject translations ───────
async function translateObject(obj, fields, lang) {
    if (!obj || !fields?.length || lang === 'en') return obj;

    const toTranslate = new Set();

    function collect(item) {
        if (Array.isArray(item))              { item.forEach(collect); return; }
        if (item && typeof item === 'object') {
            fields.forEach(f => {
                if (item[f] && typeof item[f] === 'string' && item[f].trim()) {
                    toTranslate.add(item[f]);
                }
            });
            // Recurse into nested objects/arrays (handles { data: [...], pagination: {...} } wrappers)
            Object.values(item).forEach(v => {
                if (v && typeof v === 'object') collect(v);
            });
        }
    }
    collect(obj);

    if (!toTranslate.size) return obj;

    const translated = await batchTranslate([...toTranslate], lang);

    function inject(item) {
        if (Array.isArray(item))              return item.map(inject);
        if (item && typeof item === 'object') {
            const copy = { ...item };
            fields.forEach(f => {
                if (copy[f] && translated[copy[f]]) copy[f] = translated[copy[f]];
            });
            // Recurse into nested objects/arrays (handles { data: [...], pagination: {...} } wrappers)
            Object.keys(copy).forEach(k => {
                if (copy[k] && typeof copy[k] === 'object') copy[k] = inject(copy[k]);
            });
            return copy;
        }
        return item;
    }

    return inject(obj);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Main interceptor — wire into main.jsx fetch wrapper.
 * Only acts on GET responses that match FIELD_MAP endpoints.
 *
 * @param {string} url    — request URL
 * @param {*}      data   — parsed JSON response body
 * @param {string} lang   — current user language from localStorage['PM_LANGUAGE']
 * @returns {*}           — data with translated fields (or original if en/no fields)
 */
export async function interceptTranslation(url, data, lang) {
    if (!lang || lang === 'en') return data;
    const fields = getFields(url);
    if (!fields) return data;
    try {
        return await translateObject(data, fields, lang);
    } catch (err) {
        console.warn('[dynTranslate] Non-fatal error:', err.message);
        return data;
    }
}

/**
 * Translate a single value — use in components for one-off strings.
 * Checks IDB cache, falls back to server, falls back to original.
 *
 * @param {string} text
 * @param {string} lang
 * @returns {Promise<string>}
 */
export async function translateValue(text, lang) {
    if (!text || lang === 'en') return text;
    const cached = await idbGet(idbKey(text, lang));
    if (cached !== null) return cached;
    const result = await batchTranslate([text], lang);
    return result[text] ?? text;
}

/**
 * Pre-warm IDB cache for a language switch.
 * Call after user changes language so first render is instant.
 *
 * @param {string[]} texts — all visible strings on current page
 * @param {string}   lang
 */
export async function prewarm(texts, lang) {
    if (!texts.length || lang === 'en') return;
    await batchTranslate([...new Set(texts)], lang);
}

export { idbKey, idbGet, idbSet, batchTranslate };
