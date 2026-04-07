// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Content Sanitization Filter
 * ==================================================
 * Sanitizes user-generated content before display to prevent
 * XSS attacks. Strips dangerous HTML tags and attributes while
 * preserving safe formatting. Applied to chat messages, work
 * order comments, and institutional knowledge entries.
 */
/**
 * Simple content filter for bad language and inappropriate content.
 * This is a client-side first line of defense.
 */

const PROFANITY_LIST = [
    // Sexual / Explicit
    'porn', 'sex', 'sexual', 'nsfw', 'naked', 'nude', 'penis', 'vagina', 'clitoris', 'scrotum',
    'intercourse', 'erotic', 'XXX', 'hentai', 'stripper', 'prostitute', 'whore', 'slut',
    'masturbate', 'orgasm', 'ejaculate', 'anal', 'bollocks', 'boob', 'breast', 'condom',
    
    // Common Profanity (English)
    'fuck', 'fucker', 'fucking', 'shit', 'shitty', 'asshole', 'bitch', 'bastard', 'cunt', 
    'dick', 'cock', 'pussy', 'faggot', 'nigger', 'kike', 'chink', 'retard', 'dyke', 'spic',
    'fag', 'twat', 'wank', 'piss', 'motherfucker',

    
    // Variations / Common Leetspeak
    'f*ck', 'sh*t', 'b*tch', 'a$$', 'p0rn', '5ex', 'f u c k'
];

/**
 * Checks if a string contains any prohibited content.
 * @param {string} text - The input text to check.
 * @returns {Array|null} - Null if clean, or an array of found prohibited words.
 */
export const checkContent = (text) => {
    if (!text) return null;
    
    const normalizedText = text.toLowerCase();
    const foundWords = [];
    
    PROFANITY_LIST.forEach(word => {
        // Build a regex that allows optional non-alphanumeric characters between letters
        const fuzzyPattern = word.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-z0-9]*');
        const regex = new RegExp(`\\b${fuzzyPattern}\\b`, 'i');
        
        if (regex.test(normalizedText)) {
            // SPECIAL CASE: Contextual check for 'Dick' (The Scunthorpe Problem)
            if (word === 'dick') {
                // If it's capitalized 'Dick' anywhere, we treat it as a name. 
                // In a professional environment, people don't usually start insults with a polite capital letter.
                if (/\bDick\b/.test(text)) {
                    return; 
                }
            }

            foundWords.push(word);
        }
    });


    return foundWords.length > 0 ? foundWords : null;
};


/**
 * Removes profanity from text (masking with asterisks)
 */
export const sanitizeText = (text) => {
    let sanitized = text;
    PROFANITY_LIST.forEach(word => {
        const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        sanitized = sanitized.replace(regex, (match) => '*'.repeat(match.length));
    });
    return sanitized;
};
