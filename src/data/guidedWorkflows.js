// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * guidedWorkflows.js — Guided Execution Workflow Registry
 * =========================================================
 * Static, version-controlled registry of all guided workflows.
 * Each entry declares what a workflow IS — steps, targets,
 * validations, eligibility, and risk level. No executable logic
 * lives here; all execution is delegated to the four registries
 * and the GuidedExecution engine.
 *
 * INVARIANTS ENFORCED BY THIS FILE:
 *   I-GE1 — Anchors are data-guide strings only; no CSS or text selectors
 *   I-GE2 — All instruction text is i18n keys; no translated strings
 *   I-GE3 — Validation references registry keys; no inline logic
 *   I-GE4 — Eligibility declared; engine enforces before start
 *   allowAutoAction is hardcoded false on every workflow — never override
 *
 * MANUAL STABILITY RULE — Manual content is not an execution contract.
 *   The manual links to guides via window.startTrierGuide(workflowId).
 *   The workflowId is the stable key in this file.  Manual titles, page
 *   numbers, section indices, and translated headings are ALL volatile and
 *   must NEVER appear here.  Renaming or reordering a manual section must
 *   never break guide launch.
 *
 *   ALLOWED:   manualSectionId: 'work-order-closeout'  ← stable kebab-case ID
 *   FORBIDDEN: manualTitle, pageNumber, sectionIndex, translatedHeading
 *
 *   Stable ID cross-reference lives in src/data/manualSections.js.
 *   Regression gate: tests/e2e/guided-execution.spec.js "Manual stability" section.
 *
 * ADDING A WORKFLOW:
 *   1. Add an entry to GUIDED_WORKFLOWS keyed by its stable ID
 *   2. Register all new validation.check keys in guideValidation.js
 *   3. Register all new eligibility.prerequisiteChecks in guideValidation.js
 *   4. Add all new target.anchor values to the anchor catalog in GUIDED_EXECUTION_DESIGN.md
 *   5. Add data-guide attributes to the target UI elements
 *   6. If the workflow has a manual section, add it to src/data/manualSections.js
 *   Do not add a workflow until its anchor elements exist in the DOM.
 *
 * PILOT STATUS: close-out-work-order only. No other workflows until pilot passes.
 */

const GUIDED_WORKFLOWS = {

  'close-out-work-order': {
    id:              'close-out-work-order',
    title:           'guide.closeout.title',
    manualSectionId: 'work-order-closeout',

    eligibility: {
      roles: [
        'Technician', 'Supervisor', 'Manager',
        'maintenance_manager', 'plant_manager',
        'general_manager',
      ],
      requiredContext: [
        { key: 'plantId',     source: 'session'   },
        { key: 'workOrderId', source: 'selection' },
      ],
      prerequisiteChecks: [
        'workOrderSelected',
        'workOrderNotClosed',
        'plantContextValid',
      ],
    },

    risk: {
      level:                'medium',
      requiresConfirmation: false,
      allowAutoAction:      false,
    },

    steps: [
      {
        id:          'navigate-to-jobs',
        instruction: 'guide.closeout.step1',
        target:      { route: '/jobs', anchor: 'wo-list-row' },
        action:      { type: 'navigate' },
        validation:  { type: 'route',  check: 'onJobsRoute' },
        onFailure:   { message: 'guide.closeout.step1.fail', recovery: 'retry' },
      },
      {
        id:          'select-work-order',
        instruction: 'guide.closeout.step2',
        target:      { route: '/jobs', anchor: 'wo-list-row' },
        action:      { type: 'click' },
        validation:  { type: 'state', check: 'workOrderSelected' },
        onFailure:   { message: 'guide.closeout.step2.fail', recovery: 'retry' },
      },
      {
        id:          'open-closeout-wizard',
        instruction: 'guide.closeout.step3',
        target:      { route: '/jobs', anchor: 'closeout-button' },
        action:      { type: 'click' },
        validation:  { type: 'state', check: 'closeoutWizardOpen' },
        onFailure:   { message: 'guide.closeout.step3.fail', recovery: 'retry' },
      },
      {
        id:          'record-labor',
        instruction: 'guide.closeout.step4',
        target:      { route: '/jobs', anchor: 'closeout-labor-hours' },
        action:      { type: 'fill' },
        validation:  { type: 'state', check: 'closeoutLaborEntered' },
        onFailure:   { message: 'guide.closeout.step4.fail', recovery: 'retry' },
      },
      {
        id:          'add-parts',
        instruction: 'guide.closeout.step5',
        target:      { route: '/jobs', anchor: 'closeout-parts-search' },
        action:      { type: 'fill' },
        validation:  { type: 'state', check: 'closeoutPartsAdded' },
        onFailure:   { message: 'guide.closeout.step5.fail', recovery: 'retry' },
      },
      {
        id:          'submit-closeout',
        instruction: 'guide.closeout.step6',
        target:      { route: '/jobs', anchor: 'closeout-submit-button' },
        action:      { type: 'click' },
        validation:  { type: 'api',   check: 'closeoutSubmitSucceeded' },
        onFailure:   { message: 'guide.closeout.step6.fail', recovery: 'retry' },
      },
    ],
  },

};

export default GUIDED_WORKFLOWS;
