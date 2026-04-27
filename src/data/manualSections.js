// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * manualSections.js — Manual Section ID Registry
 * ================================================
 * Maps stable manual section IDs to guided workflow IDs.
 * This is the ONLY sanctioned link between the product manual and
 * Guided Execution.
 *
 * ARCHITECTURAL RULE — Manual content is not an execution contract.
 *   Guided Execution may link FROM the manual, but workflow identity
 *   must live in stable IDs.  Manual text, titles, page numbers,
 *   section indices, and translated headings are ALL volatile and
 *   must never appear in this file or in guidedWorkflows.js.
 *
 * ALLOWED:
 *   manualSectionId: 'work-order-closeout'   ← stable kebab-case ID
 *   workflowId:      'close-out-work-order'  ← stable workflow registry key
 *
 * NEVER ALLOWED:
 *   manualTitle, pageNumber, sectionIndex, translatedHeading
 *
 * ADDING A SECTION:
 *   1. Pick a stable kebab-case ID (never changes, even if the section
 *      is renamed or reordered in the manual).
 *   2. Add the entry here.
 *   3. Add manualSectionId to the corresponding entry in guidedWorkflows.js.
 *   4. The manual deep-link calls: window.startTrierGuide(workflowId)
 *      It must NOT pass a title, page number, or translated string.
 *
 * REGRESSION GATE:
 *   tests/e2e/guided-execution.spec.js "Manual stability" section
 *   verifies that every manualSectionId in guidedWorkflows.js is
 *   registered here, and that no forbidden fields exist.
 */

const MANUAL_SECTIONS = {

    'work-order-closeout': {
        workflowId: 'close-out-work-order',
    },

};

export default MANUAL_SECTIONS;
