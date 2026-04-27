// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * guideAnchor.js — Guided Execution Anchor Resolver
 * ==================================================
 * Resolves data-guide attribute strings to DOM elements.
 * Stateless. Called by the engine when activating each step.
 *
 * INVARIANT ENFORCED: I-GE1 — Stable anchors only.
 * This module never queries by class name, element type, text
 * content, or any selector that can change independently of the
 * guide. Only [data-guide="..."] attribute queries are used.
 *
 * EDGE CASES HANDLED:
 *   Missing anchor  — returns null; engine shows onFailure.message
 *   Duplicate anchor — logs a dev warning; engine uses the first match
 *   Hidden element   — returned as-is; engine calls scrollIntoView,
 *                      then re-checks visibility before activating step
 *
 * -- KEY FUNCTIONS --------------------------------------------------
 *   resolveAnchor(anchor)        — Returns first matching element or null
 *   isAnchorVisible(el)          — Returns true if element is in the viewport
 *                                  and not display:none / visibility:hidden
 *   scrollAnchorIntoView(el)     — Scrolls element into view (smooth)
 */

/**
 * Resolves a data-guide anchor string to the first matching DOM element.
 * Returns null if no match is found.
 * Warns in development if multiple matches exist (duplicate anchor).
 *
 * @param {string} anchor
 * @returns {HTMLElement|null}
 */
export function resolveAnchor(anchor) {
    if (!anchor || typeof anchor !== 'string') {
        console.warn('[guideAnchor] resolveAnchor called with invalid anchor:', anchor);
        return null;
    }

    const matches = document.querySelectorAll(`[data-guide="${CSS.escape(anchor)}"]`);

    if (matches.length === 0) return null;

    if (matches.length > 1 && process.env.NODE_ENV !== 'production') {
        console.warn(
            `[guideAnchor] Duplicate data-guide anchor: "${anchor}" — ` +
            `${matches.length} elements found. Using first match. ` +
            `Each anchor should be unique or intentionally shared (e.g. list rows).`
        );
    }

    return matches[0] ?? null;
}

/**
 * Returns true if the element is rendered and within the viewport.
 * Does not account for z-index occlusion (I-GE5 occlusion is handled by the engine).
 *
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export function isAnchorVisible(el) {
    if (!el) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }

    const rect = el.getBoundingClientRect();
    return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
    );
}

/**
 * Scrolls an element into view smoothly, centering it vertically.
 * No-op if el is null or already fully visible.
 *
 * @param {HTMLElement} el
 */
export function scrollAnchorIntoView(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}
