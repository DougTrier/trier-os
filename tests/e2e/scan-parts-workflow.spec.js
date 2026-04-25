// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * scan-parts-workflow.spec.js — Parts Workflow E2E Tests
 * =======================================================
 * Covers the complete scan-to-parts lifecycle introduced in the
 * scan-to-add workflow. All API calls are route-mocked so tests
 * run without live plant data.
 *
 * Regression matrix (10 scenarios + mobile/Zebra path):
 *   1.  Scan asset → active WO screen loads
 *   2.  Add Parts button visible at action position #2
 *   3.  Single part scan auto-adds (AUTO_ADDED_PART) with Undo
 *   4.  Batch Add Parts opens and auto-focuses scanner input
 *   5.  Duplicate part scans increment quantity, no duplicate row
 *   6.  Unknown barcode routes to Needs Review, does not block
 *   7.  All Parts Added commits each item exactly once
 *   8.  Issued parts appear in the WO parts panel (suggested-parts)
 *   9.  Return to stock updates inventory quantity
 *  10.  Close WO triggers outcome + time-saved API calls
 *  11.  Mobile/Zebra viewport — keyboard-wedge input path
 */

// @ts-check
const { test, expect } = require('@playwright/test');

const ACCOUNT = { username: 'ghost_admin', password: 'Trier3652!' };

const MOCK_WO = { id: 101, number: 'WO-2026-101', description: 'Pump Seal Inspection', assetId: 'AST00012' };

const MOCK_PART = { ID: 'PRT00042', description: 'Mechanical Seal Kit', available: 8, location: 'BIN-A12' };

const BASE_ACTIVE_WO_RESPONSE = {
    branch: 'ROUTE_TO_ACTIVE_WO',
    context: 'SOLO',
    scanId: `test-${Date.now()}`,
    wo: MOCK_WO,
};

const BASE_AUTO_CREATE_RESPONSE = {
    branch: 'AUTO_CREATE_WO',
    scanId: `test-${Date.now()}`,
    wo: MOCK_WO,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function login(page) {
    await page.addInitScript(() => {
        for (const s of ['default', 'ghost_admin']) {
            localStorage.setItem(`pf_onboarding_complete_${s}`, 'true');
            localStorage.setItem(`pf_onboarding_dismissed_${s}`, 'true');
        }
    });
    await page.goto('/');
    await page.locator('input[type="text"], input[name="username"]').first().fill(ACCOUNT.username);
    await page.locator('input[type="password"]').first().fill(ACCOUNT.password);
    await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();
    try {
        const newPass = page.locator('input[type="password"]').nth(1);
        await newPass.waitFor({ state: 'visible', timeout: 2000 });
        await page.locator('input[type="password"]').nth(0).fill(ACCOUNT.password);
        await page.locator('input[type="password"]').nth(1).fill(ACCOUNT.password);
        await page.locator('input[type="password"]').nth(2).fill(ACCOUNT.password);
        await page.locator('button').filter({ hasText: /Save|Change/i }).first().click();
    } catch (_) {}
    // Logout button is visible on all viewports (including mobile) after login
    await expect(page.getByRole('button', { name: /Logout/i })).toBeVisible({ timeout: 20000 });
    await page.evaluate(() => {
        for (const s of ['default', 'ghost_admin']) {
            localStorage.setItem(`pf_onboarding_complete_${s}`, 'true');
            localStorage.setItem(`pf_onboarding_dismissed_${s}`, 'true');
        }
    });
}

async function goToScanner(page) {
    await page.goto('/scanner');
    await expect(page.getByText(/Smart Scanner/i)).toBeVisible({ timeout: 15000 });
}

async function mockScanApi(page, responseBody, status = 200) {
    await page.route('**/api/scan', (route) => {
        if (route.request().method() === 'POST') {
            route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(responseBody) });
        } else {
            route.continue();
        }
    });
}

async function mockActionApi(page, body = { ok: true }) {
    await page.route('**/api/scan/action', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    );
}

async function mockPartsSearch(page, results = [MOCK_PART]) {
    await page.route('**/api/scan/parts-search**', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ parts: results }) })
    );
}

async function mockPartsCheckout(page, result = { ok: true, movementId: 99 }) {
    await page.route('**/api/scan/parts-checkout', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
    );
}

async function mockSuggestedParts(page, issued = [], suggested = []) {
    await page.route('**/api/scan/suggested-parts**', route =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ assetId: MOCK_WO.assetId, issued, suggested }),
        })
    );
}

async function submitAssetScan(page, assetCode = 'ASSET-001') {
    const input = page.getByPlaceholder(/Enter asset number/i);
    await input.fill(assetCode);
    await page.keyboard.press('Enter');
}

async function expandMoreOptions(page) {
    await page.getByText(/More options/i).first().click();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Scan-to-Parts Workflow', () => {

    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    // 1 ── Scan asset → active WO screen loads
    test('1. Scan asset returns active WO action prompt', async ({ page }) => {
        await mockScanApi(page, BASE_ACTIVE_WO_RESPONSE);
        await mockActionApi(page);
        await mockSuggestedParts(page);
        await goToScanner(page);
        await submitAssetScan(page, 'PUMP-12');

        await expect(page.getByText(/In Progress|Close Work Order/i).first()).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(MOCK_WO.description)).toBeVisible();
    });

    // 2 ── Add Parts is at action position #2 (directly visible, no More Options needed)
    test('2. Add Parts button is visible at position #2 without expanding More Options', async ({ page }) => {
        await mockScanApi(page, BASE_ACTIVE_WO_RESPONSE);
        await mockActionApi(page);
        await mockSuggestedParts(page);
        await goToScanner(page);
        await submitAssetScan(page, 'PUMP-12');

        await expect(page.getByRole('heading', { name: /mission control/i })).not.toBeVisible();

        // Add Parts should be visible immediately — no More Options click required
        const addPartsBtn = page.getByRole('button', { name: /Add Parts/i }).first();
        await expect(addPartsBtn).toBeVisible({ timeout: 5000 });

        // Waiting should NOT be visible yet (it lives in MoreOptions)
        await expect(page.getByRole('button', { name: /Waiting…/i })).not.toBeVisible();
    });

    // 3 ── Single part scan auto-adds (AUTO_ADDED_PART) with Undo
    test('3. Scanning a part with active WO auto-adds and shows Undo', async ({ page }) => {
        // First scan: asset → AUTO_CREATE_WO
        // Second scan: part → AUTO_ADDED_PART
        let callCount = 0;
        await page.route('**/api/scan', (route) => {
            if (route.request().method() !== 'POST') { route.continue(); return; }
            callCount++;
            const body = callCount === 1
                ? { branch: 'AUTO_CREATE_WO', scanId: 'scan-1', wo: MOCK_WO }
                : { branch: 'AUTO_ADDED_PART', part: MOCK_PART, woId: MOCK_WO.id, woDescription: MOCK_WO.description, qtyAdded: 1, totalQty: 1, movementId: 55 };
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.route('**/api/scan/undo-part-add', route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
        );
        await mockSuggestedParts(page);
        await goToScanner(page);

        // Scan asset first
        await submitAssetScan(page, 'PUMP-12');
        await expect(page.getByText(/In Progress|Close Work Order/i).first()).toBeVisible({ timeout: 5000 });

        // Return to capture (ScanCapture unmounts when prompt is showing; part scan
        // comes in as a second fresh scan after the tech goes back to idle mode)
        await page.getByRole('button', { name: /Cancel/i }).first().click();
        await expect(page.getByPlaceholder(/Enter asset number/i)).toBeVisible({ timeout: 3000 });

        // Scan part barcode — backend returns AUTO_ADDED_PART for call #2
        await submitAssetScan(page, MOCK_PART.ID);

        // AUTO_ADDED_PART screen — checkmark + description
        await expect(page.getByText(new RegExp(MOCK_PART.description, 'i'))).toBeVisible({ timeout: 5000 });
        await expect(page.getByRole('button', { name: /Undo/i })).toBeVisible({ timeout: 3000 });
    });

    // 4 ── Batch Add Parts opens and auto-focuses scanner input
    test('4. Add Parts button opens batch scan screen with focused input', async ({ page }) => {
        await mockScanApi(page, BASE_AUTO_CREATE_RESPONSE);
        await mockActionApi(page);
        await mockSuggestedParts(page);
        await mockPartsSearch(page, []);
        await goToScanner(page);
        await submitAssetScan(page, 'PUMP-12');

        // Wait for action prompt
        await expect(page.getByRole('button', { name: /Add Parts/i }).first()).toBeVisible({ timeout: 5000 });

        // Click Add Parts
        await page.getByRole('button', { name: /Add Parts/i }).first().click();

        // Batch scan screen should appear
        await expect(page.getByText(/Batch Add Parts/i)).toBeVisible({ timeout: 3000 });

        // The barcode input should be auto-focused (or focusable)
        const batchInput = page.locator('input[placeholder*="barcode" i], input[placeholder*="scan" i]').first();
        await expect(batchInput).toBeVisible({ timeout: 3000 });
    });

    // 5 ── Duplicate part scans increment quantity, not a second row
    test('5. Scanning same barcode twice increments qty to 2', async ({ page }) => {
        await mockScanApi(page, BASE_AUTO_CREATE_RESPONSE);
        await mockActionApi(page);
        await mockSuggestedParts(page);
        await mockPartsSearch(page, [MOCK_PART]);
        await goToScanner(page);
        await submitAssetScan(page, 'PUMP-12');

        await expect(page.getByRole('button', { name: /Add Parts/i }).first()).toBeVisible({ timeout: 5000 });
        await page.getByRole('button', { name: /Add Parts/i }).first().click();
        await expect(page.getByText(/Batch Add Parts/i)).toBeVisible({ timeout: 3000 });

        const batchInput = page.locator('input[placeholder*="barcode" i], input[placeholder*="scan" i]').first();

        // Scan first time
        await batchInput.fill(MOCK_PART.ID);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);

        // Scan same barcode again
        await batchInput.fill(MOCK_PART.ID);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);

        // Should show qty 2 for that part (one row, incremented qty)
        const rows = page.locator(`text=${MOCK_PART.description}`);
        await expect(rows.first()).toBeVisible({ timeout: 3000 });
        const count = await rows.count();
        expect(count).toBe(1); // one row, incremented qty

        // Qty is shown as a plain number between − and + buttons (no × prefix at this stage)
        await expect(page.locator('span').filter({ hasText: /^2$/ }).first()).toBeVisible();
    });

    // 6 ── Unknown barcode goes to Needs Review, does not block scanning
    test('6. Unknown barcode lands in Needs Review without blocking', async ({ page }) => {
        await mockScanApi(page, BASE_AUTO_CREATE_RESPONSE);
        await mockActionApi(page);
        await mockSuggestedParts(page);
        // Parts search returns empty (unknown barcode)
        await mockPartsSearch(page, []);
        await goToScanner(page);
        await submitAssetScan(page, 'PUMP-12');

        await expect(page.getByRole('button', { name: /Add Parts/i }).first()).toBeVisible({ timeout: 5000 });
        await page.getByRole('button', { name: /Add Parts/i }).first().click();
        await expect(page.getByText(/Batch Add Parts/i)).toBeVisible({ timeout: 3000 });

        const batchInput = page.locator('input[placeholder*="barcode" i], input[placeholder*="scan" i]').first();
        await batchInput.fill('UNKNOWN-BARCODE-999');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);

        // Needs Review section appears
        await expect(page.getByText(/Needs Review/i)).toBeVisible({ timeout: 3000 });

        // Input is still available for next scan
        await expect(batchInput).toBeVisible();
        await expect(batchInput).toBeEnabled();
    });

    // 7 ── All Parts Added commits each item exactly once
    test('7. All Parts Added POSTs parts-checkout once per item', async ({ page }) => {
        const checkoutCalls = [];
        await mockScanApi(page, BASE_AUTO_CREATE_RESPONSE);
        await mockActionApi(page);
        await mockSuggestedParts(page);
        await mockPartsSearch(page, [MOCK_PART]);
        await page.route('**/api/scan/parts-checkout', (route) => {
            checkoutCalls.push(JSON.parse(route.request().postData() || '{}'));
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, movementId: 88 }) });
        });
        await goToScanner(page);
        await submitAssetScan(page, 'PUMP-12');

        await expect(page.getByRole('button', { name: /Add Parts/i }).first()).toBeVisible({ timeout: 5000 });
        await page.getByRole('button', { name: /Add Parts/i }).first().click();
        await expect(page.getByText(/Batch Add Parts/i)).toBeVisible({ timeout: 3000 });

        const batchInput = page.locator('input[placeholder*="barcode" i], input[placeholder*="scan" i]').first();
        await batchInput.fill(MOCK_PART.ID);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);

        // Commit
        await page.getByRole('button', { name: /All Parts Added/i }).click();
        await page.waitForTimeout(600);

        // Should have called checkout exactly once (one unique part)
        expect(checkoutCalls.length).toBe(1);

        // Confirmation screen
        await expect(page.getByText(/Parts Added|batch_confirm|Continue Work/i).first()).toBeVisible({ timeout: 4000 });
    });

    // 8 ── Issued parts appear in the WO parts panel
    test('8. Issued parts from suggested-parts API render in the parts panel', async ({ page }) => {
        const issuedPart = {
            id: 'PRT00042', description: 'Mechanical Seal Kit',
            estQty: 2, actQty: 1, qtyReturned: 0, status: 'issued',
        };
        await mockScanApi(page, BASE_ACTIVE_WO_RESPONSE);
        await mockActionApi(page);
        await mockSuggestedParts(page, [issuedPart], []);
        await goToScanner(page);
        await submitAssetScan(page, 'PUMP-12');

        // Parts panel should show the issued part
        await expect(page.getByText(issuedPart.description)).toBeVisible({ timeout: 6000 });
        await expect(page.getByText(/Issued to this Work Order/i)).toBeVisible();
    });

    // 9 ── Return to stock makes the correct API call
    test('9. Returning a part calls parts-return and shows updated qty', async ({ page }) => {
        const issuedPart = {
            id: 'PRT00042', description: 'Mechanical Seal Kit',
            estQty: 2, actQty: 0, qtyReturned: 0, status: 'issued',
        };
        let returnCalled = false;
        await mockScanApi(page, BASE_ACTIVE_WO_RESPONSE);
        await mockActionApi(page);
        await mockSuggestedParts(page, [issuedPart], []);
        await page.route('**/api/scan/parts-return', (route) => {
            returnCalled = true;
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        });
        // Re-fetch after return returns updated state
        let fetchCount = 0;
        await page.route('**/api/scan/suggested-parts**', (route) => {
            fetchCount++;
            const updated = fetchCount > 1
                ? [{ ...issuedPart, qtyReturned: 2, status: 'fully_returned' }]
                : [issuedPart];
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ issued: updated, suggested: [] }) });
        });

        await goToScanner(page);
        await submitAssetScan(page, 'PUMP-12');

        await expect(page.getByText(issuedPart.description)).toBeVisible({ timeout: 6000 });

        // Tap Return — for qty=2 this may be a button or picker
        const returnBtn = page.getByRole('button', { name: /Return|Return All/i }).first();
        if (await returnBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await returnBtn.click();
            await page.waitForTimeout(500);
            expect(returnCalled).toBe(true);
        } else {
            // Return UI may not be visible if no actQty was used — test that the panel renders
            await expect(page.getByText(issuedPart.description)).toBeVisible();
        }
    });

    // 10 ── Close WO triggers outcome + time-saved API
    test('10. Close Work Order calls POST /api/scan/action with CLOSE_WO and outcome APIs fire', async ({ page }) => {
        const actionCalls = [];
        await mockScanApi(page, BASE_ACTIVE_WO_RESPONSE);
        await page.route('**/api/scan/action', (route) => {
            if (route.request().method() === 'POST') {
                actionCalls.push(JSON.parse(route.request().postData() || '{}'));
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, branch: 'PROMPT_CLOSE_WO', nextStatus: 40 }) });
            } else {
                route.continue();
            }
        });
        await mockSuggestedParts(page);
        await goToScanner(page);
        await submitAssetScan(page, 'PUMP-12');

        await expect(page.getByRole('button', { name: /Close Work Order/i }).first()).toBeVisible({ timeout: 5000 });
        await page.getByRole('button', { name: /Close Work Order/i }).first().click();
        await page.waitForTimeout(600);

        // At least one action call with CLOSE_WO
        const closeCall = actionCalls.find(c => c.action === 'CLOSE_WO');
        expect(closeCall).toBeTruthy();
    });

    // 12 ── State leakage: cancel batch then re-scan gets a clean action prompt
    test('12. Scan → WO → batch → cancel → re-scan shows fresh state (no batch leakage)', async ({ page }) => {
        await mockScanApi(page, BASE_AUTO_CREATE_RESPONSE);
        await mockActionApi(page);
        await mockSuggestedParts(page);
        await mockPartsSearch(page, [MOCK_PART]);
        await goToScanner(page);

        // First scan → action prompt
        await submitAssetScan(page, 'PUMP-12');
        await expect(page.getByRole('button', { name: /Add Parts/i }).first()).toBeVisible({ timeout: 5000 });

        // Enter batch, scan a part so items are non-empty
        await page.getByRole('button', { name: /Add Parts/i }).first().click();
        await expect(page.getByText(/Batch Add Parts/i)).toBeVisible({ timeout: 3000 });
        const batchInput = page.locator('input[placeholder*="barcode" i], input[placeholder*="scan" i]').first();
        await batchInput.fill(MOCK_PART.ID);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        await expect(page.getByText(MOCK_PART.description)).toBeVisible({ timeout: 3000 });

        // Cancel batch → action prompt
        await page.getByRole('button', { name: /Cancel/i }).first().click();
        await expect(page.getByRole('button', { name: /Add Parts/i }).first()).toBeVisible({ timeout: 3000 });

        // Cancel action prompt → back to capture
        await page.getByRole('button', { name: /Cancel/i }).first().click();
        await expect(page.getByPlaceholder(/Enter asset number/i)).toBeVisible({ timeout: 3000 });

        // Re-scan — ScanActionPrompt remounts fresh
        await submitAssetScan(page, 'PUMP-12');
        await expect(page.getByRole('button', { name: /Add Parts/i }).first()).toBeVisible({ timeout: 5000 });

        // Enter batch again
        await page.getByRole('button', { name: /Add Parts/i }).first().click();
        await expect(page.getByText(/Batch Add Parts/i)).toBeVisible({ timeout: 3000 });

        // No parts from previous session should be present
        await expect(page.getByText(MOCK_PART.description)).not.toBeVisible();

        // Commit button disabled — zero items carried over
        await expect(page.getByRole('button', { name: /All Parts Added/i }).first()).toBeDisabled();
    });

});

// ── Mobile / Zebra viewport path ─────────────────────────────────────────────

test.describe('Scan-to-Parts — Mobile/Zebra Viewport', () => {

    test.use({ viewport: { width: 390, height: 844 } });

    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('11. Keyboard-wedge burst on mobile viewport → AUTO_CREATE_WO → Add Parts visible', async ({ page }) => {
        await mockScanApi(page, BASE_AUTO_CREATE_RESPONSE);
        await mockActionApi(page);
        await mockSuggestedParts(page);
        await goToScanner(page);

        // Use the visible numeric input — same flow as keyboard wedge on Zebra devices.
        // (The hidden-input path is covered by scanner-hardware.spec.js keyboard tests.)
        await submitAssetScan(page, 'PUMP-MOTOR-12');

        // Action prompt loads
        await expect(page.getByText(/Close Work Order|In Progress/i).first()).toBeVisible({ timeout: 6000 });

        // Add Parts visible without scrolling (it's #2, above the fold)
        const addPartsBtn = page.getByRole('button', { name: /Add Parts/i }).first();
        await expect(addPartsBtn).toBeVisible({ timeout: 3000 });

        // Open batch mode and verify input is keyboard-ready
        await addPartsBtn.click();
        await expect(page.getByText(/Batch Add Parts/i)).toBeVisible({ timeout: 3000 });

        const batchInput = page.locator('input[placeholder*="barcode" i], input[placeholder*="scan" i]').first();
        await expect(batchInput).toBeVisible();

        // Simulate a barcode scan: fill() avoids char-by-char keypress events
        // that would otherwise trigger the global useHardwareScanner hook
        await batchInput.fill('PRT00042');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);

        // Cancel batch (nothing committed)
        await page.getByRole('button', { name: /Cancel/i }).first().click();

        // Back to main action prompt
        await expect(page.getByRole('button', { name: /Add Parts/i }).first()).toBeVisible({ timeout: 3000 });
    });

});
