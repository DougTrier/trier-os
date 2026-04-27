// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * guideLauncher.js — Manual-to-Guide Entry Point
 * =================================================
 * Resolves a manual section ID to its mapped workflow ID and fires the
 * engine.  This is the ONLY sanctioned path from manual content into
 * Guided Execution — no logic, no context checks, no navigation.
 *
 * The manual declares a link (sectionId → workflowId via MANUAL_SECTIONS).
 * The engine enforces everything else: risk gate, context gate, eligibility,
 * step validation.  This function does one thing: look up and launch.
 *
 * INVARIANT: manual content is not an execution contract.
 *   - Launch is always by stable workflowId, never by title or section text.
 *   - If the section has no mapped workflow → silent no-op + console warn.
 *   - If the engine is not mounted → silent no-op + console warn.
 */

import MANUAL_SECTIONS from '../data/manualSections';

/**
 * Launch the guided workflow mapped to a manual section.
 * No-op if the section has no workflow or the engine is not ready.
 *
 * @param {string} sectionId  — key in MANUAL_SECTIONS (e.g. 'work-order-closeout')
 */
export function startGuidedFromManual(sectionId) {
    const section = MANUAL_SECTIONS[sectionId];
    if (!section?.workflowId) {
        console.warn('[Guide] No workflow mapped for manual section:', sectionId);
        return;
    }
    if (typeof window.startTrierGuide !== 'function') {
        console.warn('[Guide] startTrierGuide not available — guide engine not mounted');
        return;
    }
    window.startTrierGuide(section.workflowId);
}
