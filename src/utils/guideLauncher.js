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
import { resolveRequired } from './guideContext';

/**
 * Launch the guided workflow mapped to a manual section.
 *
 * If workOrderId context is missing the engine would immediately block with
 * "Cannot Start" — a dead end when launched from the manual where no WO is
 * open.  Instead, open the Context Acquisition Bridge: a split view that
 * navigates the app to /jobs and waits for the user to select a WO, then
 * starts the guide automatically.  No context is fixed silently.
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

    const { missing } = resolveRequired([{ key: 'workOrderId', source: 'selection' }]);
    if (missing.includes('workOrderId')) {
        if (typeof window.openGuideContextBridge === 'function') {
            window.openGuideContextBridge({ workflowId: section.workflowId, sectionId });
        } else {
            console.warn('[Guide] openGuideContextBridge not available');
        }
        return;
    }

    window.startTrierGuide(section.workflowId);
}
