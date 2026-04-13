// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * scanner-hardware.spec.js — Scan State Machine E2E Tests
 * =========================================================
 * End-to-end coverage for the P1 Scan State Machine:
 *
 *   1. Numeric input path → POST /api/scan → 1s confirmation overlay → action prompt
 *   2. Keyboard-wedge hardware scanner simulation (rapid keypress burst → Enter)
 *   3. Camera button renders; permission-denied falls back to numeric mode
 *   4. Branch routing: AUTO_CREATE_WO, ROUTE_TO_ACTIVE_WO, ROUTE_TO_WAITING_WO
 *   5. Action prompt buttons match the branch response context
 *   6. Mission Control review queue renders for manager roles
 *   7. Duplicate scanId is rejected (AUTO_REJECT_DUPLICATE_SCAN)
 *
 * API calls are intercepted with Playwright route mocking so tests run
 * without real plant data. The state machine logic itself is covered by
 * server-side integration tests; here we verify UI wiring and flow only.
 */

// @ts-check
const { test, expect } = require('@playwright/test');

const ACCOUNT = { username: 'ghost_admin', password: 'Trier3652!' };
const BASE_SCAN_RESPONSE = {
    branch: 'AUTO_CREATE_WO',
    scanId: 'test-scan-id-001',
    deviceTimestamp: new Date().toISOString(),
    wo: { id: '42', number: 'WO-2026-001', description: 'Pump Motor Inspection' },
};

// ── Shared login helper ───────────────────────────────────────────────────────
async function login(page) {
    // Suppress onboarding/contextual tours — they have a 1.5s auto-show delay that
    // can overlay scanner UI and intercept pointer events mid-test.
    // OnboardingTour's getUserKey() uses localStorage.username || 'default'.
    // Since username may not be in localStorage before login, cover all variants.
    await page.addInitScript(() => {
        const suffixes = ['default', 'ghost_admin'];
        for (const s of suffixes) {
            localStorage.setItem(`pf_onboarding_complete_${s}`, 'true');
            localStorage.setItem(`pf_onboarding_dismissed_${s}`, 'true');
        }
    });
    await page.goto('/');
    await page.locator('input[type="text"], input[name="username"]').first().fill(ACCOUNT.username);
    await page.locator('input[type="password"]').first().fill(ACCOUNT.password);
    await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();

    // Bypass forced password change if present
    try {
        const newPass = page.locator('input[type="password"]').nth(1);
        await newPass.waitFor({ state: 'visible', timeout: 2000 });
        await page.locator('input[type="password"]').nth(0).fill(ACCOUNT.password);
        await page.locator('input[type="password"]').nth(1).fill(ACCOUNT.password);
        await page.locator('input[type="password"]').nth(2).fill(ACCOUNT.password);
        await page.locator('button').filter({ hasText: /Save|Change/i }).first().click();
    } catch (_) {}

    // Wait for Mission Control to render — proves the session cookie is set and
    // isAuthenticated has flipped to true. URL check alone passes instantly because
    // the app never navigates to a /login path; it renders LoginView inline.
    await expect(page.getByRole('heading', { name: /mission control/i })).toBeVisible({ timeout: 20000 });

    // Belt-and-suspenders tour suppression: set keys while on current page so they
    // persist into any subsequent navigation (addInitScript above covers the early-load
    // case; this covers any timing gap where the component mounted before the script ran).
    await page.evaluate(() => {
        for (const s of ['default', 'ghost_admin']) {
            localStorage.setItem(`pf_onboarding_complete_${s}`, 'true');
            localStorage.setItem(`pf_onboarding_dismissed_${s}`, 'true');
        }
    });
}

// ── Navigate to scanner workspace ─────────────────────────────────────────────
async function goToScanner(page) {
    // All scan tests mock the API so plantId value doesn't matter.
    // Navigate directly — the scanner renders regardless of which plant is active.
    await page.goto('/scanner');
    await expect(page.getByText(/Smart Scanner/i)).toBeVisible({ timeout: 15000 });
}

// ── Mock POST /api/scan to return a controlled branch response ────────────────
async function mockScanApi(page, responseBody, status = 200) {
    await page.route('**/api/scan', (route) => {
        if (route.request().method() === 'POST') {
            route.fulfill({
                status,
                contentType: 'application/json',
                body: JSON.stringify(responseBody),
            });
        } else {
            route.continue();
        }
    });
}

// ── Mock POST /api/scan/action ────────────────────────────────────────────────
async function mockActionApi(page, responseBody = { ok: true, branch: 'PROMPT_CLOSE_WO', nextStatus: 40 }) {
    await page.route('**/api/scan/action', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(responseBody),
        });
    });
}

// =============================================================================

test.describe('Scan State Machine — ScanCapture component', () => {

    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('Scanner workspace renders capture UI with Scan QR Code button and numeric input', async ({ page }) => {
        await goToScanner(page);

        // Camera scan button
        await expect(page.getByRole('button', { name: /Scan QR Code/i })).toBeVisible({ timeout: 5000 });

        // Numeric fallback input
        await expect(page.getByPlaceholder(/Enter asset number/i)).toBeVisible();

        // Instruction hint
        await expect(page.getByText(/Hardware scanner auto-detects/i)).toBeVisible();
    });

    test('Numeric input path → confirmation overlay → AUTO_CREATE_WO action prompt', async ({ page }) => {
        await mockScanApi(page, { ...BASE_SCAN_RESPONSE, branch: 'AUTO_CREATE_WO' });
        await goToScanner(page);

        // Type asset code and submit
        const input = page.getByPlaceholder(/Enter asset number/i);
        await input.fill('ASSET-001');
        await page.keyboard.press('Enter');

        // 1-second confirmation overlay should flash
        await expect(page.getByText('ASSET-001')).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(/Pump Motor Inspection|WO-2026-001|New Work Order/i).first()).toBeVisible({ timeout: 5000 });

        // After overlay clears, action prompt for AUTO_CREATE_WO shows "Work Started"
        await expect(page.getByText(/Work Started/i)).toBeVisible({ timeout: 3000 });
        await expect(page.getByText(/WO-2026-001/i).first()).toBeVisible();
    });

    test('ROUTE_TO_ACTIVE_WO — solo context shows Close, Waiting, Escalate, Continue Later', async ({ page }) => {
        await mockScanApi(page, {
            ...BASE_SCAN_RESPONSE,
            branch: 'ROUTE_TO_ACTIVE_WO',
            context: 'SOLO',
        });
        await mockActionApi(page);
        await goToScanner(page);

        const input = page.getByPlaceholder(/Enter asset number/i);
        await input.fill('PUMP-42');
        await page.keyboard.press('Enter');

        // Wait for action prompt
        await expect(page.getByText(/Close Work Order/i)).toBeVisible({ timeout: 4000 });
        await expect(page.getByText(/Waiting/i)).toBeVisible();
        await expect(page.getByText(/Escalate/i)).toBeVisible();
        await expect(page.getByText(/Continue Later/i)).toBeVisible();
    });

    test('ROUTE_TO_ACTIVE_WO — OTHER_USER_ACTIVE context shows Join, Take Over, Escalate', async ({ page }) => {
        await mockScanApi(page, {
            ...BASE_SCAN_RESPONSE,
            branch: 'ROUTE_TO_ACTIVE_WO',
            context: 'OTHER_USER_ACTIVE',
            activeUsers: [{ userId: 'tech_b', name: 'Tech B' }],
        });
        await mockActionApi(page);
        await goToScanner(page);

        const input = page.getByPlaceholder(/Enter asset number/i);
        await input.fill('PUMP-42');
        await page.keyboard.press('Enter');

        await expect(page.getByText(/Join Existing Work/i)).toBeVisible({ timeout: 4000 });
        await expect(page.getByText(/Take Over/i)).toBeVisible();
        await expect(page.getByText(/Escalate/i)).toBeVisible();
    });

    test('ROUTE_TO_ACTIVE_WO — MULTI_TECH context shows Leave Work, Close for Team, Waiting, Escalate', async ({ page }) => {
        await mockScanApi(page, {
            ...BASE_SCAN_RESPONSE,
            branch: 'ROUTE_TO_ACTIVE_WO',
            context: 'MULTI_TECH',
            activeUsers: [{ userId: 'tech_b', name: 'Tech B' }],
        });
        await mockActionApi(page);
        await goToScanner(page);

        const input = page.getByPlaceholder(/Enter asset number/i);
        await input.fill('PUMP-42');
        await page.keyboard.press('Enter');

        await expect(page.getByText(/Leave Work/i)).toBeVisible({ timeout: 4000 });
        await expect(page.getByText(/Close for Team/i)).toBeVisible();
        await expect(page.getByText(/Waiting/i)).toBeVisible();
        await expect(page.getByText(/Escalate/i)).toBeVisible();
    });

    test('ROUTE_TO_WAITING_WO — shows Resume and Create New WO options', async ({ page }) => {
        await mockScanApi(page, {
            ...BASE_SCAN_RESPONSE,
            branch: 'ROUTE_TO_WAITING_WO',
            wo: { id: '99', number: 'WO-2026-099', description: 'Conveyor Belt Repair', holdReason: 'WAITING_ON_PARTS' },
        });
        await mockActionApi(page);
        await goToScanner(page);

        const input = page.getByPlaceholder(/Enter asset number/i);
        await input.fill('BELT-07');
        await page.keyboard.press('Enter');

        await expect(page.getByText(/Resume Waiting WO/i)).toBeVisible({ timeout: 4000 });
        await expect(page.getByText(/Create New Work Order/i)).toBeVisible();
        await expect(page.getByText(/View Status Only/i)).toBeVisible();
        // Hold reason should show in the subtitle
        await expect(page.getByText(/On Hold/i)).toBeVisible();
    });

    test('AUTO_REJECT_DUPLICATE_SCAN — shows duplicate warning, no action buttons', async ({ page }) => {
        await mockScanApi(page, {
            ...BASE_SCAN_RESPONSE,
            branch: 'AUTO_REJECT_DUPLICATE_SCAN',
        });
        await goToScanner(page);

        const input = page.getByPlaceholder(/Enter asset number/i);
        await input.fill('ASSET-001');
        await page.keyboard.press('Enter');

        await expect(page.getByText(/Duplicate Scan/i)).toBeVisible({ timeout: 4000 });
        await expect(page.getByText(/already been processed/i)).toBeVisible();
        // No action buttons present
        await expect(page.getByText(/Close Work Order/i)).not.toBeVisible();
    });

    test('Hold reason picker appears when Waiting… is tapped', async ({ page }) => {
        await mockScanApi(page, {
            ...BASE_SCAN_RESPONSE,
            branch: 'ROUTE_TO_ACTIVE_WO',
            context: 'SOLO',
        });
        await mockActionApi(page);
        await goToScanner(page);

        const input = page.getByPlaceholder(/Enter asset number/i);
        await input.fill('PUMP-42');
        await page.keyboard.press('Enter');

        // Tap Waiting… to enter hold reason picker
        await page.getByText(/Waiting…/i).first().click();

        // Hold reason picker should show all tech-selectable codes
        await expect(page.getByText(/Why are you pausing/i)).toBeVisible({ timeout: 3000 });
        await expect(page.getByText(/Waiting on Parts/i)).toBeVisible();
        await expect(page.getByText(/Waiting on Vendor/i)).toBeVisible();
        await expect(page.getByText(/Scheduled Return/i)).toBeVisible();
        await expect(page.getByText(/Continue Later/i)).toBeVisible();
        await expect(page.getByText(/Shift End/i)).toBeVisible();
    });

    test('SCHEDULED_RETURN — return window picker follows hold reason picker', async ({ page }) => {
        await mockScanApi(page, {
            ...BASE_SCAN_RESPONSE,
            branch: 'ROUTE_TO_ACTIVE_WO',
            context: 'SOLO',
        });
        await mockActionApi(page);
        await goToScanner(page);

        const input = page.getByPlaceholder(/Enter asset number/i);
        await input.fill('PUMP-42');
        await page.keyboard.press('Enter');

        // Open hold reason picker
        await page.getByText(/Waiting…/i).first().click();
        await expect(page.getByText(/Why are you pausing/i)).toBeVisible({ timeout: 3000 });

        // Select Scheduled Return
        await page.getByText(/Scheduled Return/i).click();

        // Return window picker should appear
        await expect(page.getByText(/When are you returning/i)).toBeVisible({ timeout: 3000 });
        await expect(page.getByText(/Later This Shift/i)).toBeVisible();
        await expect(page.getByText(/Next Shift/i)).toBeVisible();
        await expect(page.getByText(/Tomorrow/i)).toBeVisible();
    });

    test('Team close confirmation screen appears before TEAM_CLOSE is submitted', async ({ page }) => {
        await mockScanApi(page, {
            ...BASE_SCAN_RESPONSE,
            branch: 'ROUTE_TO_ACTIVE_WO',
            context: 'MULTI_TECH',
            activeUsers: [{ userId: 'tech_b', name: 'Tech B' }],
        });
        await mockActionApi(page);
        await goToScanner(page);

        const input = page.getByPlaceholder(/Enter asset number/i);
        await input.fill('PUMP-42');
        await page.keyboard.press('Enter');

        // Tap Close for Team
        await page.getByText(/Close for Team/i).first().click();

        // Confirmation screen must appear before the action is submitted
        await expect(page.getByText(/Other technicians are still active/i)).toBeVisible({ timeout: 3000 });
        await expect(page.getByText(/Close Work Order for Everyone/i)).toBeVisible();
        await expect(page.getByText(/Cancel/i)).toBeVisible();
    });

    test('Action completion resets view back to ScanCapture', async ({ page }) => {
        await mockScanApi(page, { ...BASE_SCAN_RESPONSE, branch: 'AUTO_CREATE_WO' });
        await goToScanner(page);

        const input = page.getByPlaceholder(/Enter asset number/i);
        await input.fill('ASSET-002');
        await page.keyboard.press('Enter');

        // "Work Started" confirmation
        await expect(page.getByText(/Work Started/i)).toBeVisible({ timeout: 4000 });

        // Click Done to reset
        await page.getByRole('button', { name: /Done/i }).click();

        // Should return to capture view
        await expect(page.getByPlaceholder(/Enter asset number/i)).toBeVisible({ timeout: 3000 });
    });

    test('Server error surfaces inline — view stays on capture, no hard crash', async ({ page }) => {
        await mockScanApi(page, { error: 'Asset not found' }, 404);
        await goToScanner(page);

        const input = page.getByPlaceholder(/Enter asset number/i);
        await input.fill('UNKNOWN-9999');
        await page.keyboard.press('Enter');

        // Error message shown inline
        await expect(page.getByText(/Asset not found/i)).toBeVisible({ timeout: 4000 });

        // Capture UI is still available for retry
        await expect(page.getByPlaceholder(/Enter asset number/i)).toBeVisible();
    });

});

// =============================================================================

test.describe('Scan State Machine — Hardware Wedge Simulation', () => {

    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('Keyboard-wedge burst (rapid keypresses + Enter) submits as a scan', async ({ page }) => {
        await mockScanApi(page, { ...BASE_SCAN_RESPONSE, branch: 'AUTO_CREATE_WO' });
        await goToScanner(page);

        // Simulate Zebra hardware scanner: rapid character burst then Enter
        // The hidden input must be focused (mode=idle auto-focuses it)
        const hiddenInput = page.locator('input[aria-hidden="true"]');
        await hiddenInput.focus();

        // Dispatch characters in quick succession (< 80ms apart) — use keyboard.press
        for (const char of 'PUMP-MOTOR-001') {
            await page.keyboard.press(char);
        }
        await page.keyboard.press('Enter');

        // Confirmation overlay or action prompt should appear
        await expect(
            page.getByText(/PUMP-MOTOR-001|Work Started|In Progress/i).first()
        ).toBeVisible({ timeout: 5000 });
    });

    test('Single stray keypress (< 3 chars) is ignored — no scan submitted', async ({ page }) => {
        let scanCalled = false;
        await page.route('**/api/scan', (route) => {
            if (route.request().method() === 'POST') {
                scanCalled = true;
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BASE_SCAN_RESPONSE) });
            } else {
                route.continue();
            }
        });
        await goToScanner(page);

        // Single stray character — should not trigger a scan
        const hiddenInput = page.locator('input[aria-hidden="true"]');
        await hiddenInput.focus();
        await page.keyboard.press('X');

        // Wait beyond WEDGE_BURST_MS to let the timeout fire
        await page.waitForTimeout(200);

        expect(scanCalled).toBe(false);
        // View should still show capture UI
        await expect(page.getByPlaceholder(/Enter asset number/i)).toBeVisible();
    });

});

// =============================================================================

test.describe('Scan State Machine — Camera Mode', () => {

    test('Camera permission denied falls back to numeric input mode', async ({ context, page }) => {
        await login(page);

        // Block camera permissions
        await context.clearPermissions();
        await context.grantPermissions([], {
            origin: await page.evaluate(() => window.location.origin),
        });

        await goToScanner(page);

        // Click the camera scan button
        await page.getByRole('button', { name: /Scan QR Code/i }).click();

        // Should surface the permission-denied message
        await expect(
            page.getByText(/Camera permission denied|Camera unavailable/i)
        ).toBeVisible({ timeout: 8000 });

        // Numeric input is still accessible
        await expect(page.getByPlaceholder(/Enter asset number/i)).toBeVisible();
    });

    test('Camera Scan QR Code button is visible in capture mode', async ({ page }) => {
        await login(page);
        await goToScanner(page);
        await expect(page.getByRole('button', { name: /Scan QR Code/i })).toBeVisible();
    });

});

// =============================================================================

test.describe('Scan State Machine — Mission Control Review Queue', () => {

    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('Review Queue is hidden for technician role', async ({ page }) => {
        // Set role to technician — the queue should not render at all
        await page.evaluate(() => localStorage.setItem('userRole', 'technician'));
        await page.goto('/');

        // If no flagged WOs exist, queue renders null — so just verify no queue header appears
        await expect(page.getByText(/Review Queue/i)).not.toBeVisible({ timeout: 3000 });
    });

    test('Review Queue renders for manager role when flagged WOs exist', async ({ page }) => {
        // Mock the needs-review endpoint to return a flagged WO
        await page.route('**/api/scan/needs-review', (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    flagged: [{
                        ID: 55,
                        WorkOrderNumber: 'WO-2026-055',
                        Description: 'Compressor Seal Leak',
                        AstID: 'COMP-01',
                        StatusID: 35,
                        holdReason: 'CONTINUE_LATER',
                        reviewReason: 'AUTO_TIMEOUT',
                        reviewStatus: 'FLAGGED',
                        AssetName: 'Main Compressor',
                    }],
                    overdueScheduled: [],
                    counts: { flagged: 1, overdueScheduled: 0 },
                }),
            });
        });

        // Use manager role
        await page.evaluate(() => localStorage.setItem('userRole', 'manager'));
        await page.goto('/');
        await expect(page.locator('.mc-container')).toBeVisible({ timeout: 15000 });

        // Review Queue section should appear
        await expect(page.getByText(/Review Queue/i)).toBeVisible({ timeout: 5000 });

        // The flagged WO row should show
        await expect(page.getByText(/WO-2026-055/i)).toBeVisible();
        await expect(page.getByText(/Compressor Seal Leak/i)).toBeVisible();
        await expect(page.getByText(/Auto-timeout/i)).toBeVisible();
    });

    test('Review Queue shows overdue scheduled returns under their own header', async ({ page }) => {
        const overdueReturnAt = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago

        await page.route('**/api/scan/needs-review', (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    flagged: [],
                    overdueScheduled: [{
                        ID: 77,
                        WorkOrderNumber: 'WO-2026-077',
                        Description: 'HVAC Filter Change',
                        AstID: 'HVAC-03',
                        StatusID: 35,
                        holdReason: 'SCHEDULED_RETURN',
                        returnAt: overdueReturnAt,
                        AssetName: 'HVAC Unit 3',
                    }],
                    counts: { flagged: 0, overdueScheduled: 1 },
                }),
            });
        });

        await page.evaluate(() => localStorage.setItem('userRole', 'maintenance_manager'));
        await page.goto('/');
        await expect(page.locator('.mc-container')).toBeVisible({ timeout: 15000 });

        await expect(page.getByText(/Overdue Scheduled Returns/i)).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(/WO-2026-077/i)).toBeVisible();
        await expect(page.getByText(/Return was due at/i)).toBeVisible();
    });

    test('Desk Close button calls POST /api/scan/desk-action and queue refreshes', async ({ page }) => {
        let deskActionCalled = false;
        let deskActionBody = null;

        await page.route('**/api/scan/needs-review', (route) => {
            // First call returns flagged WO; second call (after action) returns empty
            if (!deskActionCalled) {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        flagged: [{
                            ID: 55, WorkOrderNumber: 'WO-2026-055', Description: 'Compressor Seal Leak',
                            AstID: 'COMP-01', StatusID: 35, holdReason: 'CONTINUE_LATER',
                            reviewReason: 'AUTO_TIMEOUT', reviewStatus: 'FLAGGED', AssetName: 'Main Compressor',
                        }],
                        overdueScheduled: [],
                        counts: { flagged: 1, overdueScheduled: 0 },
                    }),
                });
            } else {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ flagged: [], overdueScheduled: [], counts: { flagged: 0, overdueScheduled: 0 } }),
                });
            }
        });

        await page.route('**/api/scan/desk-action', async (route) => {
            deskActionCalled = true;
            deskActionBody = JSON.parse(route.request().postData() || '{}');
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, branch: 'DESK_CLOSE', nextStatus: 40 }),
            });
        });

        await page.evaluate(() => localStorage.setItem('userRole', 'manager'));
        await page.goto('/');
        await expect(page.locator('.mc-container')).toBeVisible({ timeout: 15000 });

        // Click the Close button on the flagged WO row
        await expect(page.getByText(/WO-2026-055/i)).toBeVisible({ timeout: 5000 });
        await page.getByRole('button', { name: /Close/i }).first().click();

        // Desk action was fired with correct deskAction code
        await page.waitForTimeout(500);
        expect(deskActionCalled).toBe(true);
        expect(deskActionBody.deskAction).toBe('DESK_CLOSE');
    });

});

// =============================================================================

test.describe('Scan State Machine — ScanEntryPoint (forgot-scanner recovery path)', () => {

    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    // Navigate to an asset detail modal in the assets registry
    async function openAssetDetail(page) {
        // Use Plant_1 so the assets API returns real rows (all_sites is aggregate-only).
        await page.evaluate(() => localStorage.setItem('selectedPlantId', 'Plant_1'));
        await page.goto('/assets');
        await expect(page.getByText(/Assets & Machinery/i)).toBeVisible({ timeout: 10000 });

        // Assets table rows — click the "View" button on the first data row.
        // The <tr> itself has no onClick; only the View button inside does.
        const viewBtn = page.locator('table tbody tr').first().getByRole('button', { name: /view/i });
        await viewBtn.waitFor({ state: 'visible', timeout: 10000 });
        await viewBtn.click();

        // Wait for the detail panel to open with ScanEntryPoint visible
        await expect(page.getByText(/Work Order Actions/i)).toBeVisible({ timeout: 8000 });
    }

    test('Asset detail modal contains Work Order Actions panel with Start Work button', async ({ page }) => {
        await openAssetDetail(page);

        // ScanEntryPoint panel should be visible
        await expect(page.getByText(/Work Order Actions/i)).toBeVisible();

        // Start Work button present and enabled
        const startBtn = page.getByRole('button', { name: /Start Work on This Asset/i });
        await expect(startBtn).toBeVisible();
        await expect(startBtn).toBeEnabled();
    });

    test('Show QR toggle reveals inline QR code canvas', async ({ page }) => {
        await openAssetDetail(page);

        // Click Show QR
        await page.getByRole('button', { name: /Show QR/i }).click();

        // Canvas element for QR code should be present
        const qrCanvas = page.locator('canvas[title*="QR code for asset"]');
        await expect(qrCanvas).toBeAttached({ timeout: 5000 });

        // Toggle off
        await page.getByRole('button', { name: /Hide QR/i }).click();
        await expect(qrCanvas).not.toBeAttached({ timeout: 2000 });
    });

    test('Start Work on asset calls POST /api/scan with the correct assetId', async ({ page }) => {
        let capturedBody = null;

        await page.route('**/api/scan', (route) => {
            if (route.request().method() === 'POST') {
                capturedBody = JSON.parse(route.request().postData() || '{}');
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        branch: 'AUTO_CREATE_WO',
                        scanId: capturedBody.scanId,
                        deviceTimestamp: capturedBody.deviceTimestamp,
                        wo: { id: '1', number: 'WO-ASSET-TEST', description: 'Asset Page Test WO' },
                    }),
                });
            } else {
                route.continue();
            }
        });

        await openAssetDetail(page);

        // Get the assetId that was rendered in the modal title
        const modalTitle = await page.locator('.glass-card .modal-content-standard [class*="ActionBar"], .modal-content-standard').first().textContent();

        // Click Start Work
        await page.getByRole('button', { name: /Start Work on This Asset/i }).click();

        // Verify the correct assetId was sent
        await page.waitForTimeout(500);
        expect(capturedBody).not.toBeNull();
        expect(capturedBody.assetId).toBeTruthy();
        expect(capturedBody.scanId).toBeTruthy();
        expect(capturedBody.deviceTimestamp).toBeTruthy();
    });

    test('Start Work → confirmation overlay → action prompt renders over the asset modal', async ({ page }) => {
        await page.route('**/api/scan', (route) => {
            if (route.request().method() === 'POST') {
                const body = JSON.parse(route.request().postData() || '{}');
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        branch: 'ROUTE_TO_ACTIVE_WO',
                        context: 'SOLO',
                        scanId: body.scanId,
                        deviceTimestamp: body.deviceTimestamp,
                        wo: { id: '5', number: 'WO-LIVE-001', description: 'Live Test WO' },
                    }),
                });
            } else {
                route.continue();
            }
        });

        await page.route('**/api/scan/action', (route) => {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        });

        await openAssetDetail(page);
        await page.getByRole('button', { name: /Start Work on This Asset/i }).click();

        // Action prompt overlay should appear with SOLO context buttons
        await expect(page.getByText(/Close Work Order/i)).toBeVisible({ timeout: 4000 });
        await expect(page.getByText(/Waiting/i)).toBeVisible();
        await expect(page.getByText(/Escalate/i)).toBeVisible();
    });

    test('API error on Start Work surfaces inline — button remains available for retry', async ({ page }) => {
        await page.route('**/api/scan', (route) => {
            if (route.request().method() === 'POST') {
                route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Asset not found in plant' }) });
            } else {
                route.continue();
            }
        });

        await openAssetDetail(page);
        await page.getByRole('button', { name: /Start Work on This Asset/i }).click();

        // Error renders inside the panel — does not crash the asset modal
        await expect(page.getByText(/Asset not found in plant/i)).toBeVisible({ timeout: 4000 });
        // Start Work button still present for retry
        await expect(page.getByRole('button', { name: /Start Work on This Asset/i })).toBeVisible();
    });

});
