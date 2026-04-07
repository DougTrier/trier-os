// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Translation Glossary
 * Protects brand names, codes, and technical identifiers from being
 * corrupted by the translation provider. Uses null-byte sentinels
 * (\x00Gn\x00) that survive translation without alteration.
 *
 * To add a term: append to PROTECTED_TERMS.
 */

const PROTECTED_TERMS = [
    // System identifiers
    'Trier OS', 'TrierOS', 'Enterprise System',
    // Process / regulatory
    'HACCP', 'LOTO', 'SCADA', 'PLC', 'HMI', 'SOP', 'PPE', 'GMP',
    'OSHA', 'FDA', 'EPA', 'ISO', 'ANSI', 'NFPA', 'USDA',
    // Maintenance terms
    'MTBF', 'MTTR', 'OEE', 'PM', 'WO', 'RCA', 'FMEA', 'CBM',
    // Unit abbreviations
    'kWh', 'kPa', 'RPM', 'PSI', 'GPM', 'CFM',
];

// Sort longest-first to prevent partial replacement (e.g. "SOP" before "SO")
const SORTED = [...PROTECTED_TERMS].sort((a, b) => b.length - a.length);

// Pattern for structured codes: WO-2024-001, PM-BOILER-01, AST-XXXXX
const CODE_PATTERN = /\b([A-Z]{2,5}-[A-Z0-9]{2,}(?:-[A-Z0-9]+)*)\b/g;

/**
 * Replace protected terms + structured codes with \x00Gn\x00 sentinels.
 * @param {string} text
 * @returns {{ protected: string, map: Object }}
 */
function protect(text) {
    const map = {};
    let i = 0;
    let result = text;

    for (const term of SORTED) {
        if (!result.includes(term)) continue;
        const sentinel = `\x00G${i}\x00`;
        map[sentinel] = term;
        result = result.split(term).join(sentinel);
        i++;
    }

    result = result.replace(CODE_PATTERN, (match) => {
        // Skip if already sentineled
        const sentinel = `\x00G${i}\x00`;
        map[sentinel] = match;
        i++;
        return sentinel;
    });

    return { protected: result, map };
}

/**
 * Restore sentinels back to original terms after translation.
 * @param {string} text  — translated text with sentinels
 * @param {Object} map   — sentinel → original map from protect()
 * @returns {string}
 */
function restore(text, map) {
    let result = text;
    for (const [sentinel, original] of Object.entries(map)) {
        result = result.split(sentinel).join(original);
    }
    return result;
}

module.exports = { protect, restore, PROTECTED_TERMS };
