// Copyright © 2026 Trier OS. All Rights Reserved.
// One-shot script: fix double-escaped \\uXXXX sequences in translated i18n JSON files.
// en.json is the canonical source and is always clean — skip it.
// Run from repo root: node scripts/fix_i18n_escapes.js

const fs = require('fs');
const path = require('path');

const I18N_DIR = path.join(__dirname, '../src/i18n');
const LANGS = ['es', 'fr', 'de', 'zh', 'pt', 'ja', 'ko', 'ar', 'hi', 'tr'];

// Valid chars after \ in JSON strings (single-char escapes)
const VALID_JSON_SINGLE = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't']);

function fixEscapes(content) {
    // Pass 1: surrogate pairs \\uHigh\\uLow → emoji (these appear as 👁 in the raw text)
    content = content.replace(
        /\\u([Dd][89AaBb][0-9A-Fa-f]{2})\\u([Dd][CcDdEeFf][0-9A-Fa-f]{2})/g,
        (_, high, low) => {
            const code = 0x10000 + ((parseInt(high, 16) - 0xD800) << 10) + (parseInt(low, 16) - 0xDC00);
            return String.fromCodePoint(code);
        }
    );
    // Pass 2: BMP \uXXXX → actual character (skip control chars U+0000–U+001F which must stay escaped)
    content = content.replace(/\\u([0-9A-Fa-f]{4})/g, (match, hex) => {
        const code = parseInt(hex, 16);
        return code <= 0x1F ? match : String.fromCharCode(code);
    });

    // Pass 3: character-by-character scan — remove backslashes before invalid JSON escape targets.
    // Key rule: consume \\ (double backslash) as a unit — never split a valid pair.
    let result = '';
    let i = 0;
    while (i < content.length) {
        const ch = content[i];
        if (ch === '\\') {
            const next = content[i + 1];
            if (next === '\\') {
                // Valid \\ pair — emit both and advance past both
                result += '\\\\';
                i += 2;
            } else if (next === 'u') {
                // \uXXXX — should all be converted already, but keep valid ones defensively
                const hex = content.slice(i + 2, i + 6);
                if (/^[0-9A-Fa-f]{4}$/.test(hex)) {
                    result += '\\u' + hex;
                    i += 6;
                } else {
                    // Invalid \u — drop the backslash
                    i++;
                }
            } else if (next && VALID_JSON_SINGLE.has(next)) {
                // Valid single-char escape (\", \/, \n, \t, etc.) — emit as-is
                result += '\\' + next;
                i += 2;
            } else {
                // Invalid escape — drop the backslash.
                // If the next char is a control char (U+0000–U+001F), skip it too —
                // control chars in JSON string values are invalid and have no semantic meaning here.
                i++;
                if (next && next.charCodeAt(0) <= 0x1F) i++;
            }
        } else if (ch.charCodeAt(0) <= 0x1F && ch !== '\n' && ch !== '\r' && ch !== '\t') {
            // Bare control character outside of a valid JSON escape — skip it
            i++;
        } else {
            result += ch;
            i++;
        }
    }
    return result;
}

let totalFixed = 0;
for (const lang of LANGS) {
    const filePath = path.join(I18N_DIR, `${lang}.json`);
    const original = fs.readFileSync(filePath, 'utf8');
    const fixed = fixEscapes(original);

    // Verify valid JSON before writing (strip UTF-8 BOM — project standard)
    try {
        JSON.parse(fixed.replace(/^﻿/, ''));
    } catch (e) {
        console.error(`ERROR: ${lang}.json invalid after fix — skipping.\n  ${e.message}`);
        continue;
    }

    if (fixed !== original) {
        fs.writeFileSync(filePath, fixed, 'utf8');
        console.log(`${lang}.json — fixed`);
        totalFixed++;
    } else {
        console.log(`${lang}.json — already clean`);
    }
}
console.log(`\nFiles fixed: ${totalFixed}`);
