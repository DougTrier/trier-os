// Copyright © 2026 Trier OS. All Rights Reserved.
// Repair SMP emoji that were corrupted to U+FFFD during the Unicode unescape pass.
// Each SMP emoji (U+10000+, requires surrogate pair) became 2× U+FFFD.
// Strategy: for each key where translated value contains U+FFFD pairs, use en.json
// as the canonical emoji source — extract SMP emoji from en value, inject in order
// into the translated string where FFFD pairs appear.
// Run from repo root: node scripts/repair_emoji.js

const fs = require('fs');
const path = require('path');

const I18N_DIR = path.join(__dirname, '../src/i18n');
const LANGS = ['es', 'fr', 'de', 'zh', 'pt', 'ja', 'ko', 'ar', 'hi', 'tr'];
const FFFD = 0xFFFD;

// Parse a string and return array of SMP codepoints (> 0xFFFF) in order
function extractSMPEmoji(str) {
    const emoji = [];
    for (let i = 0; i < str.length; ) {
        const cp = str.codePointAt(i);
        if (cp > 0xFFFF) {
            emoji.push(cp);
            i += 2; // SMP chars are 2 UTF-16 code units
        } else {
            i++;
        }
    }
    return emoji;
}

// Replace consecutive FFFD pairs in translated string with emoji from enEmoji list
function repairFFFD(translatedStr, enEmoji) {
    if (!translatedStr.includes('�')) return translatedStr;
    let emojiIdx = 0;
    let result = '';
    let i = 0;
    while (i < translatedStr.length) {
        const cp = translatedStr.codePointAt(i);
        if (cp === FFFD) {
            // Check if next char is also FFFD → surrogate-pair replacement
            const nextCp = i + 1 < translatedStr.length ? translatedStr.codePointAt(i + 1) : -1;
            if (nextCp === FFFD && emojiIdx < enEmoji.length) {
                result += String.fromCodePoint(enEmoji[emojiIdx++]);
                i += 2;
            } else {
                // Lone FFFD or no more en.json emoji — remove it (translation artifact)
                i++;
            }
        } else if (cp > 0xFFFF) {
            result += String.fromCodePoint(cp);
            i += 2;
        } else {
            result += translatedStr[i];
            i++;
        }
    }
    return result;
}

const enRaw = fs.readFileSync(path.join(I18N_DIR, 'en.json'), 'utf8').replace(/^﻿/, '');
const en = JSON.parse(enRaw);

let totalKeys = 0;
let totalFiles = 0;

for (const lang of LANGS) {
    const filePath = path.join(I18N_DIR, `${lang}.json`);
    const raw = fs.readFileSync(filePath, 'utf8');
    const bom = raw.startsWith('﻿') ? '﻿' : '';
    const parsed = JSON.parse(raw.replace(/^﻿/, ''));

    let fixedKeys = 0;
    for (const [key, val] of Object.entries(parsed)) {
        if (typeof val !== 'string' || !val.includes('�')) continue;

        const enVal = en[key];
        if (!enVal) continue;

        const enEmoji = extractSMPEmoji(enVal);
        if (enEmoji.length === 0) continue;

        const repaired = repairFFFD(val, enEmoji);
        if (repaired !== val) {
            parsed[key] = repaired;
            fixedKeys++;
        }
    }

    if (fixedKeys > 0) {
        const out = bom + JSON.stringify(parsed, null, 2);
        // Validate
        try {
            JSON.parse(out.replace(/^﻿/, ''));
        } catch(e) {
            console.error(`ERROR: ${lang}.json invalid after repair — skipping. ${e.message}`);
            continue;
        }
        fs.writeFileSync(filePath, out, 'utf8');
        console.log(`${lang}.json — repaired ${fixedKeys} keys`);
        totalKeys += fixedKeys;
        totalFiles++;
    } else {
        console.log(`${lang}.json — no FFFD found`);
    }
}
console.log(`\nTotal: ${totalKeys} keys repaired across ${totalFiles} files`);
