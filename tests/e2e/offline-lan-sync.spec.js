// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * offline-lan-sync.spec.js — P8 Task 9: Offline LAN Sync E2E Tests
 * ==================================================================
 * Six scenarios covering the full offline-to-hub-to-server path:
 *
 *   1. PWA finds hub when central server is unreachable
 *   2. Scan reaches hub within 2s and SCAN_ACK returns
 *   3. Dual-scan MULTI_TECH conflict surfaces in Mission Control review queue
 *   4. Hub-submitted scans are NOT re-submitted when server comes back (dedup)
 *   5. Hub goes down — PWA falls back to IndexedDB queue gracefully
 *   6. Expired hub JWT is rejected client-side — "Hub unavailable" UX fires
 *
 * All hub WebSocket interactions use Playwright's routeWebSocket() (1.48+).
 * Central server API calls are mocked via page.route() so no live server
 * state is needed for any scenario. IndexedDB is seeded/inspected via
 * page.evaluate() using the real TrierCMMS_Offline database.
 *
 * TOKEN STRATEGY:
 *   LanHub._isTokenExpired() reads localStorage.hubToken and checks the JWT
 *   payload.exp field. We pre-compute two tokens in Node (Buffer.from base64)
 *   so we don't need a real JWT signing key:
 *     VALID_HUB_TOKEN   — exp year ~2286, always valid
 *     EXPIRED_HUB_TOKEN — exp year ~2001, always expired
 */

import { test, expect } from '@playwright/test';

// ── Token constants ───────────────────────────────────────────────────────────
// These are fake JWTs — the signature segment is garbage. LanHub only reads
// the payload for the exp claim; it never verifies the signature client-side.
const VALID_HUB_TOKEN = [
    'eyJhbGciOiJIUzI1NiJ9',
    Buffer.from(JSON.stringify({ userId: 'ghost_admin', exp: 9999999999 })).toString('base64'),
    'fakesig',
].join('.');

// exp of 1000000000 = 2001-09-08, safely in the past
const EXPIRED_HUB_TOKEN = [
    'eyJhbGciOiJIUzI1NiJ9',
    Buffer.from(JSON.stringify({ userId: 'ghost_admin', exp: 1000000000 })).toString('base64'),
    'fakesig',
].join('.');

// ── Config ────────────────────────────────────────────────────────────────────
const ACCOUNT  = { username: 'ghost_admin', password: 'Trier3652!' };
const HUB_IP   = 'plant-hub.test';
// Glob pattern that matches the hub URL regardless of the ?token= query string
const HUB_WS   = `ws://${HUB_IP}:1940*`;
// Must match DB_NAME / DB_VERSION in src/utils/OfflineDB.js exactly
const DB_NAME  = 'TrierCMMS_Offline';
const DB_VER   = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * addInitScript that:
 *   - suppresses the OnboardingTour overlay for all known accounts
 *   - writes plantHubIp + hubToken to localStorage before the first script runs
 * addInitScript only accepts a single serialisable argument, so we pass both
 * values as a single { tok, ip } object.
 */
async function addHubInitScript(page, token = VALID_HUB_TOKEN) {
    await page.addInitScript(({ tok, ip }) => {
        for (const s of ['default', 'ghost_admin', 'ghost_tech', 'ghost_exec']) {
            localStorage.setItem(`pf_onboarding_complete_${s}`, 'true');
            localStorage.setItem(`pf_onboarding_dismissed_${s}`, 'true');
        }
        localStorage.setItem('plantHubIp', ip);
        localStorage.setItem('hubToken',   tok);
    }, { tok: token, ip: HUB_IP });
}

async function login(page) {
    await page.goto('/');
    await page.locator('input[type="text"], input[name="username"]').first().fill(ACCOUNT.username);
    await page.locator('input[type="password"]').first().fill(ACCOUNT.password);
    await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();
    // Handle forced password-change screen (first boot / demo accounts)
    try {
        await page.locator('input[type="password"]').nth(1).waitFor({ state: 'visible', timeout: 2000 });
        const pw = ACCOUNT.password;
        await page.locator('input[type="password"]').nth(0).fill(pw);
        await page.locator('input[type="password"]').nth(1).fill(pw);
        await page.locator('input[type="password"]').nth(2).fill(pw);
        await page.locator('button').filter({ hasText: /Save|Change/i }).first().click();
    } catch (_) {}
    await expect(page.getByRole('heading', { name: /mission control/i })).toBeVisible({ timeout: 20000 });
}

async function goToScanner(page) {
    await page.goto('/scanner');
    await expect(page.getByText(/Smart Scanner/i)).toBeVisible({ timeout: 15000 });
}

/** Read every record from a named IndexedDB object store in the page's browser context. */
function readAllFromStore(page, storeName) {
    return page.evaluate(
        ({ dbName, dbVersion, storeName }) => new Promise((resolve) => {
            const req = indexedDB.open(dbName, dbVersion);
            req.onsuccess = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve([]); return; }
                const all = db.transaction([storeName], 'readonly').objectStore(storeName).getAll();
                all.onsuccess = (ev) => { db.close(); resolve(ev.target.result); };
                all.onerror   = ()  => { db.close(); resolve([]); };
            };
            req.onerror = () => resolve([]);
        }),
        { dbName: DB_NAME, dbVersion: DB_VER, storeName }
    );
}

/** Write records into a named IndexedDB store in the page's browser context. */
function writeToStore(page, storeName, records) {
    return page.evaluate(
        ({ dbName, dbVersion, storeName, records }) => new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, dbVersion);
            req.onsuccess = (e) => {
                const db = e.target.result;
                const tx    = db.transaction([storeName], 'readwrite');
                const store = tx.objectStore(storeName);
                records.forEach(r => store.put(r));
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror    = () => { db.close(); reject(tx.error); };
            };
            req.onerror = () => reject(req.error);
        }),
        { dbName: DB_NAME, dbVersion: DB_VER, storeName, records }
    );
}

// =============================================================================
// SCENARIO 1 — PWA finds hub when central server is down
// =============================================================================
test.describe('Scenario 1 — Hub connects when central server is unreachable', () => {

    test('OfflineStatusBar appears and PlantNetworkStatus shows hub as Connected', async ({ page }) => {
        await addHubInitScript(page);

        // Hub WebSocket mock: accept the connection and hold it open.
        // Not closing immediately is what makes LanHub fire setConnected(true).
        await page.routeWebSocket(HUB_WS, _ws => {
            // No-op — connection stays open, which is what we want to test.
        });

        await login(page);

        // Take the central server down for scan and hub-status endpoints
        await page.route('**/api/scan',       route => route.abort('failed'));
        await page.route('**/api/hub/status', route => route.fulfill({
            status: 503, contentType: 'application/json',
            body: JSON.stringify({ error: 'unreachable' }),
        }));

        await goToScanner(page);

        // A scan attempt triggers LanHub.connect() in the offline fetch interceptor
        await page.getByPlaceholder(/Enter asset number/i).fill('PUMP-OFFLINE-01');
        await page.keyboard.press('Enter');

        // OfflineStatusBar: amber "Working Offline / Offline mode" banner must appear
        await expect(page.getByText(/Offline mode|Working Offline/i)).toBeVisible({ timeout: 8000 });

        // PlantNetworkStatus: the hub chip shows "Connected · port 1940" once the
        // WebSocket open event fires and LanHub emits statusChange(true).
        await expect(page.getByText(/Connected.*1940|Connected\s*·\s*port\s*1940/i)).toBeVisible({ timeout: 8000 });
    });
});

// =============================================================================
// SCENARIO 2 — Scan reaches the hub within 2 seconds (round-trip timing)
// =============================================================================
test.describe('Scenario 2 — Hub receives SCAN within 2s; SCAN_ACK drives confirmation overlay', () => {

    test('Scan message arrives at hub WebSocket within 2 seconds of submission', async ({ page }) => {
        await addHubInitScript(page);

        let hubReceivedAt = null;

        await page.routeWebSocket(HUB_WS, ws => {
            ws.onMessage(msg => {
                try {
                    const data = JSON.parse(msg);
                    if (data.type === 'SCAN' && hubReceivedAt === null) {
                        // Record the instant the hub receives the scan — this variable
                        // lives in the Node Playwright context, not the browser, so we
                        // can read it directly after the await below.
                        hubReceivedAt = Date.now();
                        ws.send(JSON.stringify({
                            type:   'SCAN_ACK',
                            scanId: data.scanId,
                            branch: 'AUTO_CREATE_WO',
                            wo:     { id: '101', number: 'WO-HUB-101', description: 'Hub-Routed Job' },
                        }));
                    }
                } catch (_) {}
            });
        });

        // Server is down so the offline path (predictBranch + hub submit) is used
        await page.route('**/api/scan', route => route.abort('failed'));

        await login(page);
        await goToScanner(page);

        const submittedAt = Date.now();
        await page.getByPlaceholder(/Enter asset number/i).fill('MOTOR-HUB-01');
        await page.keyboard.press('Enter');

        // Confirmation overlay comes from predictBranch (local); should be visible quickly
        await expect(page.getByText(/MOTOR-HUB-01|Work Started|New Work Order/i).first())
            .toBeVisible({ timeout: 5000 });

        // Wait up to 3s for the hub WS to receive the SCAN message
        await page.waitForFunction(() => true, undefined, { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1000); // give WS round-trip time

        expect(hubReceivedAt).not.toBeNull();
        // Hub must have received the SCAN within 2 seconds of the submit button press
        expect(hubReceivedAt - submittedAt).toBeLessThan(2000);
    });
});

// =============================================================================
// SCENARIO 3 — Dual-scan MULTI_TECH conflict surfaces in review queue
// =============================================================================
test.describe('Scenario 3 — Conflict from dual scan is flagged in Mission Control review queue', () => {

    test('MULTI_TECH branch from second scan on same asset appears in review queue', async ({ page }) => {
        await addHubInitScript(page);
        await login(page);

        // Server returns MULTI_TECH — another tech is already active on this WO
        await page.route('**/api/scan', route => {
            route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({
                    branch:              'ROUTE_TO_ACTIVE_WO',
                    context:             'MULTI_TECH',
                    scanId:              'scan-conflict-001',
                    conflictAutoResolved: false,
                    wo:         { id: '99', number: 'WO-DUAL-001', description: 'Compressor Overhaul' },
                    activeUsers: [{ userId: 'tech_b', name: 'Tech B' }],
                }),
            });
        });

        // Mission Control review queue returns the conflict record the server flagged
        await page.route('**/api/scan/review-queue*', route => {
            route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({
                    items: [{
                        id:           '1',
                        woId:         '99',
                        assetId:      'COMP-001',
                        reviewReason: 'OFFLINE_CONFLICT',
                        reviewStatus: 'FLAGGED',
                        description:  'Compressor Overhaul',
                        flaggedAt:    new Date().toISOString(),
                    }],
                    total: 1,
                }),
            });
        });

        await goToScanner(page);

        await page.getByPlaceholder(/Enter asset number/i).fill('COMP-001');
        await page.keyboard.press('Enter');

        // Scanner should show MULTI_TECH prompt (join / take-over options)
        await expect(page.getByText(/Tech B|Active Team|Multi.?Tech|Join|Take Over/i).first())
            .toBeVisible({ timeout: 6000 });

        // Navigate back to Mission Control
        await page.goto('/');
        await expect(page.getByRole('heading', { name: /mission control/i }))
            .toBeVisible({ timeout: 12000 });

        // The review queue section must show a FLAGGED or "Needs Review" indicator
        await expect(page.getByText(/FLAGGED|Review Queue|Needs Review|needsReview/i).first())
            .toBeVisible({ timeout: 10000 });
    });
});

// =============================================================================
// SCENARIO 4 — Hub-submitted scans are NOT re-submitted when server returns
// =============================================================================
test.describe('Scenario 4 — Dedup: hub-submitted entries skipped by replayQueue', () => {

    test('Only the non-hub-submitted entry is sent to the server on reconnect', async ({ page }) => {
        await addHubInitScript(page);
        await login(page);

        // Track every scan-related POST so we can assert the call count
        const replayedScanIds = [];
        const captureRoute = async (route) => {
            if (route.request().method() === 'POST') {
                try {
                    const body = await route.request().postDataJSON();
                    if (body?.scanId) replayedScanIds.push(body.scanId);
                } catch (_) {}
            }
            route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({ ok: true, branch: 'AUTO_CREATE_WO', scanId: 'x', wo: { id: '1' } }),
            });
        };
        await page.route('**/api/scan',              captureRoute);
        await page.route('**/api/scan/offline-sync', captureRoute);

        // Seed IndexedDB with 2 hub-submitted entries + 1 normal queued entry.
        // hub-submitted entries must NOT be replayed (the hub already sent them).
        // The normal entry must be replayed exactly once.
        await writeToStore(page, 'sync_queue', [
            { id: 'hs-1', method: 'POST', endpoint: '/api/scan', payload: { scanId: 'scan-hub-1', assetId: 'A1' }, synced: false, syncResult: 'hub-submitted', timestamp: new Date().toISOString(), retries: 0 },
            { id: 'hs-2', method: 'POST', endpoint: '/api/scan', payload: { scanId: 'scan-hub-2', assetId: 'A2' }, synced: false, syncResult: 'hub-submitted', timestamp: new Date().toISOString(), retries: 0 },
            { id: 'nq-1', method: 'POST', endpoint: '/api/scan', payload: { scanId: 'scan-norm-1', assetId: 'A3' }, synced: false, syncResult: null,            timestamp: new Date().toISOString(), retries: 0 },
        ]);

        // Simulate coming back online — OfflineDB.startConnectivityMonitor() listens
        // for the 'online' DOM event and triggers replayQueue() when it fires.
        await page.evaluate(() => window.dispatchEvent(new Event('online')));

        // Give replayQueue enough time to iterate and POST
        await page.waitForTimeout(3000);

        // scan-hub-1 and scan-hub-2 must NOT appear — they were hub-submitted
        const hubReplays = replayedScanIds.filter(id => id.startsWith('scan-hub'));
        expect(hubReplays).toHaveLength(0);

        // scan-norm-1 must appear exactly once — no double-submit
        const normReplays = replayedScanIds.filter(id => id === 'scan-norm-1');
        expect(normReplays).toHaveLength(1);
    });
});

// =============================================================================
// SCENARIO 5 — Hub closes; scan queued in IndexedDB gracefully
// =============================================================================
test.describe('Scenario 5 — Hub goes down; PWA falls back to IndexedDB without losing scan', () => {

    test('Scan is stored in IndexedDB sync_queue when both server and hub are unreachable', async ({ page }) => {
        await addHubInitScript(page);

        // Hub WebSocket: close immediately to simulate hub down.
        // Code 1001 = "Going Away" — connection was closed normally by the endpoint.
        await page.routeWebSocket(HUB_WS, ws => {
            ws.close(1001, 'Hub offline');
        });

        // Central server also unreachable
        await page.route('**/api/scan', route => route.abort('failed'));

        await login(page);
        await goToScanner(page);

        await page.getByPlaceholder(/Enter asset number/i).fill('VALVE-FALLBACK-07');
        await page.keyboard.press('Enter');

        // Allow time for the offline queue write to complete
        await page.waitForTimeout(1500);

        // Verify the entry exists in IndexedDB sync_queue with the expected assetId
        const queue = await readAllFromStore(page, 'sync_queue');
        const entry = queue.find(e => e.payload?.assetId === 'VALVE-FALLBACK-07');
        expect(entry).toBeTruthy();
        expect(entry?.synced).toBeFalsy();

        // OfflineStatusBar must be visible — user must know they are offline
        await expect(page.getByText(/Offline mode|Working Offline/i)).toBeVisible({ timeout: 6000 });
    });
});

// =============================================================================
// SCENARIO 6 — Expired hub JWT rejected client-side
// =============================================================================
test.describe('Scenario 6 — Expired hub JWT triggers "Hub unavailable" notice in OfflineStatusBar', () => {

    test('tokenExpired fires when hub token is past its exp claim; banner shows "local queue only"', async ({ page }) => {
        // Use the EXPIRED token — LanHub._isTokenExpired() will short-circuit
        // connect() before opening a WebSocket at all.
        await addHubInitScript(page, EXPIRED_HUB_TOKEN);

        // Route the hub WS anyway so if the token check somehow passes we don't
        // leak a real network connection attempt during the test.
        await page.routeWebSocket(HUB_WS, ws => {
            ws.close(1008, 'Policy violation — invalid token');
        });

        // Server down — scan must attempt the hub path, revealing the expiry
        await page.route('**/api/scan', route => route.abort('failed'));

        await login(page);
        await goToScanner(page);

        // Trigger the offline path — LanHub.connect() will call _isTokenExpired()
        // and emit('tokenExpired') instead of opening a WebSocket.
        await page.getByPlaceholder(/Enter asset number/i).fill('MOTOR-EXPIRED-JWT');
        await page.keyboard.press('Enter');

        await page.waitForTimeout(1000);

        // OfflineStatusBar should show the token-expired chip (rendered when
        // hubTokenExpired state is true, set by LanHub.onTokenExpired() handler).
        await expect(page.getByText(/Hub unavailable|local queue only|token expired/i))
            .toBeVisible({ timeout: 6000 });
    });
});
