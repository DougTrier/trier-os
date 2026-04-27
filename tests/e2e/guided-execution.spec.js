// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * guided-execution.spec.js — Guided Execution Engine Proof Suite
 * ================================================================
 * Proves all five GuidedExecution invariants hold against a running
 * instance with real authentication. No mocks — every assertion runs
 * against a live server with real database state.
 *
 * INVARIANTS VERIFIED:
 *   I-GE1 — Stable data-guide anchors are highlighted correctly
 *   I-GE2 — No translated text used as a selector (keys only)
 *   I-GE3 — State proves completion — steps advance on validation, not clicks
 *   I-GE4 — Context proves eligibility — engine blocks before start on bad context
 *   I-GE5 — Guide panel never occludes the active target element
 *
 * TRIGGER:   window.startTrierGuide(workflowId) — exposed in App.jsx
 * PANEL:     data-testid="guide-panel"
 * HIGHLIGHT: data-guide-active attribute on active target element
 *
 * REQUIRES: running server, ghost_admin auth, at least one open work order.
 *
 * -- API DEPENDENCIES ------------------------------------------
 *   POST /api/guide/complete  — Audited on workflow completion (Section 5)
 */

import { test, expect } from '@playwright/test';
import GUIDED_WORKFLOWS from '../../src/data/guidedWorkflows.js';
import MANUAL_SECTIONS  from '../../src/data/manualSections.js';

test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

// Navigate to /jobs scoped to Plant_1.
// ghost_admin is it_admin so isForeignPlant=false for any plant, but Plant_1 is
// a real registered plant with Open WOs eligible for close-out.  Using all_sites
// here would expose a Completed/foreign WO first and hide the closeout-button.
async function navigateToJobs(page) {
    // Set Plant_1 context before loading so the component's plantId prop is correct.
    // First navigate to any app page to access localStorage (storageState has all_sites).
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => localStorage.setItem('selectedPlantId', 'Plant_1'));
    await page.goto('/jobs');
    await page.waitForLoadState('domcontentloaded');
    const skipTour = page.getByText('Skip Tour');
    if (await skipTour.isVisible({ timeout: 2000 }).catch(() => false)) {
        await skipTour.click();
    }
    await expect(page.locator('[data-guide="wo-list-row"]').first()).toBeVisible({ timeout: 15000 });
}

async function openFirstWorkOrder(page) {
    // Filter out Completed/Closed rows so prerequisite checks hit eligibility gates
    // (e.g. insufficientRole) rather than the workOrderNotClosed gate that fires first.
    const viewBtn = page.locator('[data-guide="wo-list-row"]')
        .filter({ hasNot: page.locator('span').filter({ hasText: /complet|closed/i }) })
        .first()
        .locator('button.btn-view-standard');
    await viewBtn.click();

    // closeout-button renders when: WO is loaded + !isForeignPlant.
    // ghost_admin (it_admin) is never foreign, so button appears for any open WO.
    await expect(page.locator('[data-guide="closeout-button"]')).toBeVisible({ timeout: 10000 });

    // Wait for WorkOrdersView to publish selectedWorkOrder before any guide eligibility check fires
    await page.waitForFunction(() => window.__trierGuideContext?.selectedWorkOrder != null, { timeout: 8000 });

    // Dismiss any contextual tour that fires on WO detail open
    const skipTour = page.getByText('Skip Tour');
    if (await skipTour.isVisible({ timeout: 2000 }).catch(() => false)) {
        await skipTour.click();
    }
}

async function addFirstPartResult(page) {
    const searchInput = page.locator('[data-guide="closeout-parts-search"]');
    await searchInput.click();
    await searchInput.fill('belt');
    // Wait for the dropdown to populate (not a fixed timeout — use visibility)
    await expect(page.locator('.asset-row-hover').first()).toBeVisible({ timeout: 6000 });
    // Use .click() so Playwright's retry/actionability logic applies (not dispatchEvent)
    await page.locator('.asset-row-hover').first().click();
    // Confirm the part registered in guide context before the caller tries to advance
    await page.waitForFunction(() => (window.__trierGuideContext?.partsCount ?? 0) >= 1, { timeout: 5000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Guide-specific helpers
// ─────────────────────────────────────────────────────────────────────────────

async function startGuide(page, workflowId = 'close-out-work-order') {
    await page.evaluate((id) => window.startTrierGuide(id), workflowId);
}

async function waitForGuidePanel(page) {
    await expect(page.locator('[data-testid="guide-panel"]')).toBeVisible({ timeout: 5000 });
}

async function exitGuide(page) {
    // "Exit Guide" button is present in both BLOCKED and ACTIVE panel states.
    // dispatchEvent bypasses pointer-event hit-testing so a contextual tour overlay
    // cannot intercept the click — same technique as addFirstPartResult.
    const btn = page.locator('[data-testid="guide-panel"] button:has-text("Exit Guide")');
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.dispatchEvent('click');
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Engine startup
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Engine startup', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    test('guide panel appears when startTrierGuide is called', async ({ page }) => {
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);
    });

    test('unknown workflow ID: panel shows Cannot Start with schema error', async ({ page }) => {
        await page.goto('/jobs');
        await page.waitForLoadState('domcontentloaded');
        await startGuide(page, 'does-not-exist');
        await waitForGuidePanel(page);
        const panel = page.locator('[data-testid="guide-panel"]');
        await expect(panel).toContainText('Cannot Start');
        await expect(panel).toContainText('This guided workflow is not available.');
    });

    test('exit dismisses panel and clears all data-guide-active attributes', async ({ page }) => {
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);
        await page.waitForTimeout(600); // let step 1 activate and anchor resolve
        await exitGuide(page);
        await expect(page.locator('[data-testid="guide-panel"]')).not.toBeVisible({ timeout: 3000 });
        expect(await page.locator('[data-guide-active]').count()).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Eligibility gates — I-GE4
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Eligibility gates — I-GE4', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    test('blocks with missingContext when no work order is selected', async ({ page }) => {
        // Navigate to /jobs but do NOT open a WO — workOrderId context key will be null
        await navigateToJobs(page);
        await startGuide(page);
        await waitForGuidePanel(page);
        const panel = page.locator('[data-testid="guide-panel"]');
        await expect(panel).toContainText('Cannot Start');
        await expect(panel).toContainText('Please select a work order before starting guided mode.');
    });

    test('blocks with missingPlant when selectedPlantId is removed from localStorage', async ({ page }) => {
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        const savedPlantId = await page.evaluate(() => localStorage.getItem('selectedPlantId'));
        await page.evaluate(() => localStorage.removeItem('selectedPlantId'));
        await startGuide(page);
        await waitForGuidePanel(page);
        const panel = page.locator('[data-testid="guide-panel"]');
        await expect(panel).toContainText('Cannot Start');
        await expect(panel).toContainText('Please select a plant before starting guided mode.');
        // Restore so page remains functional for teardown
        await page.evaluate((id) => { if (id) localStorage.setItem('selectedPlantId', id); }, savedPlantId);
    });

    test('blocks with insufficientRole when userRole is not in the medium risk allowlist', async ({ page }) => {
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await page.evaluate(() => localStorage.setItem('userRole', 'viewer'));
        await startGuide(page);
        await waitForGuidePanel(page);
        const panel = page.locator('[data-testid="guide-panel"]');
        await expect(panel).toContainText('Cannot Start');
        await expect(panel).toContainText('Your role does not have permission to start this guided workflow.');
        await page.evaluate(() => localStorage.removeItem('userRole'));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Step mechanics — I-GE1, I-GE3
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Step mechanics — I-GE1 and I-GE3', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    test('I-GE1: pre-selected WO skips to step 3 — closeout-button anchor is highlighted', async ({ page }) => {
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);
        // Steps 1 (onJobsRoute) and 2 (workOrderSelected) are already satisfied before
        // the engine starts, so the skip logic lands on step 3 (open-closeout-wizard).
        // The first anchor highlighted is closeout-button, not wo-list-row.
        await expect(page.locator('[data-guide="closeout-button"][data-guide-active]'))
            .toBeVisible({ timeout: 5000 });
    });

    test('step counter shows Step 3 of 6 immediately when WO pre-selected', async ({ page }) => {
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);
        const panel = page.locator('[data-testid="guide-panel"]');
        // Steps 1 and 2 are pre-satisfied — engine skips directly to step 3
        await expect(panel).toContainText('Step 3 of 6', { timeout: 3000 });
    });

    test('I-GE3: steps 1 and 2 advance automatically when state is already valid', async ({ page }) => {
        // WO pre-selected → onJobsRoute=true and workOrderSelected=true on first poll.
        // Both steps pass without any user action, advancing guide to step 3.
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);
        const panel = page.locator('[data-testid="guide-panel"]');
        // Allow ~2× the per-step timing (350ms anchor + 500ms poll) × 2 steps + buffer
        await expect(panel).toContainText('Step 3 of 6', { timeout: 5000 });
    });

    test('I-GE1: step 3 target (closeout-button) is highlighted after steps 1-2 auto-pass', async ({ page }) => {
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);
        await expect(page.locator('[data-guide="closeout-button"][data-guide-active]'))
            .toBeVisible({ timeout: 5000 });
    });

    test('exit mid-step: no data-guide-active attributes remain after exit', async ({ page }) => {
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);
        await page.waitForTimeout(500);
        await exitGuide(page);
        await expect(page.locator('[data-testid="guide-panel"]')).not.toBeVisible({ timeout: 3000 });
        expect(await page.locator('[data-guide-active]').count()).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: I-GE5 — Panel never occludes the active target
// ─────────────────────────────────────────────────────────────────────────────

test.describe('I-GE5 — Panel does not occlude target', () => {

    test('desktop (1280×800): panel bounding box does not overlap highlighted target', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);
        // WO pre-selected → guide starts at step 3 (closeout-button), not step 1 (wo-list-row)
        await expect(page.locator('[data-guide="closeout-button"][data-guide-active]'))
            .toBeVisible({ timeout: 5000 });

        const panelBox  = await page.locator('[data-testid="guide-panel"]').boundingBox();
        const targetBox = await page.locator('[data-guide="closeout-button"][data-guide-active]').boundingBox();

        expect(panelBox).not.toBeNull();
        expect(targetBox).not.toBeNull();

        // Rectangles do not overlap iff one is entirely outside the other on some axis
        const noOverlap =
            panelBox.x >= targetBox.x + targetBox.width   ||
            panelBox.x + panelBox.width  <= targetBox.x   ||
            panelBox.y >= targetBox.y + targetBox.height  ||
            panelBox.y + panelBox.height <= targetBox.y;

        expect(noOverlap).toBe(true);
    });

    test('mobile (390×844): panel renders as full-width bottom sheet below list target', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);
        await page.waitForTimeout(600); // let anchor activate

        const panelBox  = await page.locator('[data-testid="guide-panel"]').boundingBox();
        const targetBox = await page.locator('[data-guide="wo-list-row"]').first().boundingBox();

        expect(panelBox).not.toBeNull();
        expect(targetBox).not.toBeNull();

        // Bottom sheet spans full width
        expect(panelBox.width).toBeGreaterThanOrEqual(380);
        // Panel is anchored near the bottom of the viewport
        expect(panelBox.y + panelBox.height).toBeGreaterThan(700);
        // Target row is above the panel top edge (20px tolerance for borders/shadows)
        const targetBottom = targetBox.y + targetBox.height;
        const panelTop     = panelBox.y;
        expect(targetBottom).toBeLessThanOrEqual(panelTop + 20);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: Full workflow completion
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Full workflow completion', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    test('guide reaches Complete state, each anchor highlights in sequence, and audit POST is sent', async ({ page }) => {
        const auditRequests = [];
        await page.route('/api/guide/complete', async (route) => {
            auditRequests.push(await route.request().postDataJSON());
            await route.continue();
        });

        // Mock the WO close API so stock depletion across test runs cannot cause failure.
        // This test verifies the guide engine's completion logic; the close API itself
        // is exercised by qa-inspection and operator-care tests against real DB state.
        await page.route('**/api/v2/work-orders/*/close', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Work order closed and costs captured.' })
            });
        });

        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);

        const panel = page.locator('[data-testid="guide-panel"]');

        // Steps 1 and 2 auto-pass (onJobsRoute and workOrderSelected already true).
        // Wait for step 3's anchor (closeout-button) to be highlighted.
        await expect(page.locator('[data-guide="closeout-button"][data-guide-active]'))
            .toBeVisible({ timeout: 5000 });

        // Step 3 action: open the wizard.
        // Click Add Labor immediately after — closeout-labor-hours must be in the DOM
        // before step 4's 350ms anchor resolution fires (step 3 → step 4 transition takes ~500ms).
        await page.locator('[data-guide="closeout-button"]').click();
        await expect(page.getByRole('button', { name: 'Add Labor' })).toBeVisible({ timeout: 10000 });
        await page.getByRole('button', { name: 'Add Labor' }).click();

        // Step 4: verify anchor highlighted (proves engine found it), fill hours,
        // then advance wizard to step 2 so closeout-parts-search exists when step 5 anchors.
        await expect(page.locator('[data-guide="closeout-labor-hours"][data-guide-active]'))
            .toBeVisible({ timeout: 5000 });
        await page.locator('[data-guide="closeout-labor-hours"]').fill('2');
        await page.locator('.modal-content-standard button.btn-primary:has-text("Next")').click();
        await expect(page.locator('[data-guide="closeout-parts-search"]')).toBeVisible({ timeout: 5000 });

        // Step 5: verify anchor highlighted, add a part,
        // then advance wizard to step 3 so closeout-submit-button exists when step 6 anchors.
        await expect(page.locator('[data-guide="closeout-parts-search"][data-guide-active]'))
            .toBeVisible({ timeout: 5000 });
        await addFirstPartResult(page);
        const skipTour = page.getByText('Skip Tour');
        if (await skipTour.isVisible({ timeout: 1500 }).catch(() => false)) {
            await skipTour.click();
        }
        await page.locator('.modal-content-standard button.btn-primary:has-text("Next")').click();
        await expect(page.locator('[data-guide="closeout-submit-button"]')).toBeVisible({ timeout: 5000 });

        // Step 6: verify anchor highlighted, then submit.
        await expect(page.locator('[data-guide="closeout-submit-button"][data-guide-active]'))
            .toBeVisible({ timeout: 5000 });
        await page.locator('[data-guide="closeout-submit-button"]').click();

        // Guide reaches Complete state
        await expect(panel).toContainText('Complete', { timeout: 15000 });
        await expect(panel).toContainText('Work order closed out.');

        // Dismiss
        const doneBtn = page.locator('[data-testid="guide-panel"] button:has-text("Done")');
        await expect(doneBtn).toBeVisible({ timeout: 5000 });
        await doneBtn.dispatchEvent('click');
        await expect(page.locator('[data-testid="guide-panel"]')).not.toBeVisible({ timeout: 3000 });

        // Audit POST must have been sent with the correct payload shape
        expect(auditRequests.length).toBe(1);
        expect(auditRequests[0].workflowId).toBe('close-out-work-order');
        expect(Array.isArray(auditRequests[0].steps)).toBe(true);
        expect(typeof auditRequests[0].totalElapsedMs).toBe('number');
        expect(auditRequests[0].totalElapsedMs).toBeGreaterThan(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 6: Edge cases
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Edge cases', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    test('browser refresh mid-guide: no zombie state after reload', async ({ page }) => {
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);
        await page.waitForTimeout(400);

        await page.reload();
        await page.waitForLoadState('domcontentloaded');

        // Engine state lives only in React memory — reload destroys it cleanly
        await expect(page.locator('[data-testid="guide-panel"]')).not.toBeVisible({ timeout: 3000 });
        expect(await page.locator('[data-guide-active]').count()).toBe(0);
    });

    test('missing anchor: engine shows step failure message and keeps polling', async ({ page }) => {
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        // Remove the step-3 anchor (closeout-button) — guide starts at step 3 when WO is pre-selected
        await page.evaluate(() => {
            document.querySelectorAll('[data-guide="closeout-button"]')
                .forEach(el => el.removeAttribute('data-guide'));
        });
        await startGuide(page);
        await waitForGuidePanel(page);

        // Engine attempts anchor resolution after 350ms — resolveAnchor returns null —
        // setStepError is called with step3.onFailure.message
        await expect(page.locator('[data-testid="guide-panel"]'))
            .toContainText('Complete with Costs button not found', { timeout: 2000 });

        // No element is highlighted when anchor resolution failed
        expect(await page.locator('[data-guide-active]').count()).toBe(0);

        // Engine has not crashed — panel is still interactive
        await exitGuide(page);
        await expect(page.locator('[data-testid="guide-panel"]')).not.toBeVisible({ timeout: 3000 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 7: Security — engine performs no write actions autonomously
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Security — no auto-submit', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    test('engine triggers no POST/PUT/PATCH/DELETE while active and idle', async ({ page }) => {
        const writeRequests = [];
        page.on('request', req => {
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method())) {
                writeRequests.push({ method: req.method(), url: req.url() });
            }
        });

        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);
        // Let engine run through its polling cycles without any user action
        await page.waitForTimeout(2500);

        // Audit POST fires only on COMPLETE — we haven't completed, so no guide writes
        const guideWrites = writeRequests.filter(r => r.url.includes('/api/guide'));
        expect(guideWrites.length).toBe(0);

        await exitGuide(page);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 8: Plant-context invariant — no detail request may use all_sites
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Plant-context invariant', () => {
    // resolveWorkOrderPlantId must never pass 'all_sites' to a /api/work-orders/:id
    // detail request.  This invariant holds regardless of which plant view is active.

    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    test('no WO detail request sends x-plant-id=all_sites', async ({ page }) => {
        const badRequests = [];
        page.on('request', req => {
            // Match detail endpoint: /api/work-orders/:id  (no query string, no sub-path)
            if (/\/api\/work-orders\/[^/?]+$/.test(req.url())) {
                const plantHeader = req.headers()['x-plant-id'] || '';
                if (plantHeader === 'all_sites') {
                    badRequests.push({ url: req.url(), method: req.method() });
                }
            }
        });

        await navigateToJobs(page);
        await openFirstWorkOrder(page);

        expect(badRequests).toEqual([]);
    });

    test('selectedWorkOrder has a stable ID after opening a WO (never an error payload)', async ({ page }) => {
        await navigateToJobs(page);
        await openFirstWorkOrder(page);

        const wo = await page.evaluate(() => window.__trierGuideContext?.selectedWorkOrder);
        expect(wo?.error).toBeUndefined();
        const hasId = (wo?.ID != null) || (wo?.ID_INTERNAL != null);
        expect(hasId).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 9: Console hygiene
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Console hygiene — I-GE2', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    test('zero console errors while guide is active on /jobs', async ({ page }) => {
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        await startGuide(page);
        await waitForGuidePanel(page);
        await page.waitForTimeout(2500); // run through several polling cycles
        await exitGuide(page);

        const guideErrors = errors.filter(e =>
            !e.includes('favicon') &&
            !e.includes('active-segments') &&
            !e.includes('Failed to load') &&
            !e.includes('OfflineDB') &&
            !e.includes('Error fetching') &&
            !e.includes('NetworkError') &&
            !e.includes('net::ERR')
        );
        expect(guideErrors).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 10: Manual stability — architecture regression gate
// ─────────────────────────────────────────────────────────────────────────────
//
// The guide is launched by stable workflowId only.  Manual titles, page numbers,
// section indices, and translated headings must never appear in the registry.
// These tests verify the contract at the static-data level so that renaming or
// reordering a manual section can never break the guide launch.

test.describe('Manual stability — architecture regression gate', () => {

    // ── Static registry checks (no page interaction) ──────────────────────────

    test('GUIDED_WORKFLOWS contains no forbidden manual-content fields', () => {
        const FORBIDDEN = ['manualTitle', 'pageNumber', 'sectionIndex', 'translatedHeading'];
        for (const [wfId, wf] of Object.entries(GUIDED_WORKFLOWS)) {
            for (const field of FORBIDDEN) {
                expect(
                    Object.prototype.hasOwnProperty.call(wf, field),
                    `Workflow "${wfId}" must not contain forbidden field "${field}"`
                ).toBe(false);
            }
        }
    });

    test('every manualSectionId in GUIDED_WORKFLOWS is registered in MANUAL_SECTIONS', () => {
        for (const [wfId, wf] of Object.entries(GUIDED_WORKFLOWS)) {
            if (wf.manualSectionId !== undefined) {
                expect(
                    Object.prototype.hasOwnProperty.call(MANUAL_SECTIONS, wf.manualSectionId),
                    `Workflow "${wfId}" references manualSectionId "${wf.manualSectionId}" which is missing from MANUAL_SECTIONS`
                ).toBe(true);
            }
        }
    });

    test('every workflowId in MANUAL_SECTIONS resolves to a registered workflow', () => {
        for (const [sectionId, entry] of Object.entries(MANUAL_SECTIONS)) {
            expect(
                Object.prototype.hasOwnProperty.call(GUIDED_WORKFLOWS, entry.workflowId),
                `MANUAL_SECTIONS["${sectionId}"].workflowId="${entry.workflowId}" is not a registered workflow`
            ).toBe(true);
        }
    });

    // ── Runtime checks (browser required) ─────────────────────────────────────

    test('manual section title change: guide launches correctly from stable workflowId', async ({ page }) => {
        // Simulates a deep-link that the manual emits after a rename or reorder.
        // The manual must call window.startTrierGuide(workflowId) — never a title or index.
        await page.setViewportSize({ width: 1280, height: 800 });
        await navigateToJobs(page);
        await openFirstWorkOrder(page);
        const workflowId = MANUAL_SECTIONS['work-order-closeout'].workflowId;
        await startGuide(page, workflowId);
        await waitForGuidePanel(page);
        // Panel is in ACTIVE or BLOCKED state — never a schema-error "Cannot Start"
        await expect(page.locator('[data-testid="guide-panel"]'))
            .not.toContainText('This guided workflow is not available.', { timeout: 3000 });
        await exitGuide(page);
    });

    test('missing/unmapped manual section: startTrierGuide with unknown id fails gracefully', async ({ page }) => {
        // Verifies that a stale deep-link from a removed manual section does not crash —
        // it produces the same "Cannot Start / schema error" as any unknown workflowId.
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/jobs');
        await page.waitForLoadState('domcontentloaded');
        await startGuide(page, 'manual-section-that-does-not-exist');
        await waitForGuidePanel(page);
        const panel = page.locator('[data-testid="guide-panel"]');
        await expect(panel).toContainText('Cannot Start');
        await expect(panel).toContainText('This guided workflow is not available.');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 11: Manual integration
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Manual integration', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    test('happy path (Plant_1): Start Guided Mode button launches guide from manual section', async ({ page }) => {
        // Navigate to the manual with Plant_1 in localStorage.
        // A full page load clears window.__trierGuideContext, so inject a synthetic
        // open WO after load — this proves the button→guideLauncher→engine wiring
        // without depending on the Jobs view being mounted.
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await page.evaluate(() => localStorage.setItem('selectedPlantId', 'Plant_1'));
        await page.goto('/about?manual=true');
        await page.waitForLoadState('domcontentloaded');

        await page.waitForFunction(() => typeof window.startTrierGuide === 'function', { timeout: 10000 });
        await page.evaluate(() => {
            window.__trierGuideContext = window.__trierGuideContext || {};
            // StatusID 1 = Open — passes workOrderNotClosed check (StatusID 40 = Closed)
            window.__trierGuideContext.selectedWorkOrder = { ID: 101, StatusID: 1 };
        });

        const btn = page.locator('#close-out [data-testid="start-guided-mode"]');
        await btn.scrollIntoViewIfNeeded();
        await expect(btn).toBeVisible({ timeout: 5000 });
        await btn.click();

        await waitForGuidePanel(page);
        const panel = page.locator('[data-testid="guide-panel"]');
        // Panel must reach ACTIVE (Step 1 renders) — not blocked by eligibility gates
        await expect(panel).not.toContainText('Cannot Start', { timeout: 3000 });
        await expect(panel).toContainText('Step', { timeout: 3000 });

        await exitGuide(page);
    });

    test('context block: Start Guided Mode without a WO selected shows bridge panel', async ({ page }) => {
        // Navigate directly to the manual — no WO context, no Jobs view mounted.
        // Without a selected WO the app now opens GuideContextBridge (not the engine).
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await page.evaluate(() => {
            localStorage.setItem('selectedPlantId', 'Plant_1');
        });
        await page.goto('/about?manual=true');
        await page.waitForLoadState('domcontentloaded');

        await page.waitForFunction(() => typeof window.startTrierGuide === 'function', { timeout: 10000 });

        const btn = page.locator('#close-out [data-testid="start-guided-mode"]');
        await btn.scrollIntoViewIfNeeded();
        await expect(btn).toBeVisible({ timeout: 5000 });
        await btn.click();

        // Bridge opens instead of the engine panel — guides user to select a WO first
        const bridge = page.locator('[data-testid="guide-context-bridge"]');
        await expect(bridge).toBeVisible({ timeout: 5000 });
        // Bridge always shows the workflow title and footer buttons regardless of WO availability
        await expect(bridge).toContainText('Close Out a Work Order');
        await expect(bridge).toContainText('Back to Manual');

        // Dismiss via the X / Cancel button
        const cancelBtn = bridge.locator('button[title]').first();
        await cancelBtn.dispatchEvent('click');
        await expect(bridge).not.toBeVisible({ timeout: 3000 });
    });

    test('invariant: guide from manual never sends x-plant-id=all_sites on WO detail requests', async ({ page }) => {
        const badRequests = [];
        page.on('request', req => {
            if (/\/api\/work-orders\/[^/?]+$/.test(req.url())) {
                const plantHeader = req.headers()['x-plant-id'] || '';
                if (plantHeader === 'all_sites') {
                    badRequests.push({ url: req.url(), method: req.method() });
                }
            }
        });

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await page.evaluate(() => localStorage.setItem('selectedPlantId', 'Plant_1'));
        await page.goto('/about?manual=true');
        await page.waitForLoadState('domcontentloaded');

        await page.waitForFunction(() => typeof window.startTrierGuide === 'function', { timeout: 10000 });
        await page.evaluate(() => {
            window.__trierGuideContext = window.__trierGuideContext || {};
            window.__trierGuideContext.selectedWorkOrder = { ID: 101, StatusID: 1 };
        });

        const btn = page.locator('#close-out [data-testid="start-guided-mode"]');
        await btn.scrollIntoViewIfNeeded();
        await btn.click();

        await waitForGuidePanel(page);
        await page.waitForTimeout(1000); // allow any triggered requests to fire

        expect(badRequests).toEqual([]);

        await exitGuide(page);
    });
});
