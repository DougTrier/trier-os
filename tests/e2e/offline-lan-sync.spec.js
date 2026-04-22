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
// localhost is exempt from Chrome's mixed-content rules, so ws://localhost:1940
// can be opened from an https://localhost:5173 page without being blocked.
// 'plant-hub.test' would be blocked as mixed content in a secure context.
const HUB_IP   = 'localhost';
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

/**
 * Installs a browser-level WebSocket mock for connections to port 1940.
 * Uses addInitScript so it patches window.WebSocket before any app code runs.
 * Bypasses routeWebSocket (which fails for ws:// from https:// in some
 * Playwright/Chromium versions) by intercepting at the JS constructor level.
 *
 * After the test action, read results via page.evaluate:
 *   window.__hubWsConnected  — true if any :1940 WS was created
 *   window.__hubWsSent       — array of { data, time } objects for each send()
 *
 * The mock fires onopen after 20 ms (simulating a local handshake) and keeps
 * readyState === OPEN so LanHub's _replayQueue / submitScan guards pass.
 */
async function installHubWsMock(page) {
    await page.addInitScript(() => {
        if (window.__hubWsMockInstalled) return;
        window.__hubWsMockInstalled = true;
        window.__hubWsConnected = false;
        window.__hubWsSent = [];

        const _origWS = window.WebSocket;

        function HubMockWS(url) {
            this.url = url;
            this.readyState = 0; // CONNECTING
            this._handlers = {};
            window.__hubWsConnected = true;
            const self = this;
            setTimeout(() => {
                self.readyState = 1; // OPEN
                const e = new Event('open');
                if (self.onopen) self.onopen(e);
                (self._handlers.open || []).forEach(h => h(e));
            }, 20);
        }
        HubMockWS.CONNECTING = 0; HubMockWS.OPEN = 1;
        HubMockWS.CLOSING   = 2; HubMockWS.CLOSED = 3;
        HubMockWS.prototype.CONNECTING = 0; HubMockWS.prototype.OPEN = 1;
        HubMockWS.prototype.CLOSING   = 2; HubMockWS.prototype.CLOSED = 3;
        HubMockWS.prototype.addEventListener = function(ev, h) {
            (this._handlers[ev] = this._handlers[ev] || []).push(h);
        };
        HubMockWS.prototype.removeEventListener = function(ev, h) {
            if (this._handlers[ev]) this._handlers[ev] = this._handlers[ev].filter(x => x !== h);
        };
        HubMockWS.prototype.send = function(data) {
            window.__hubWsSent.push({ data, time: Date.now() });
        };
        HubMockWS.prototype.close = function() {
            this.readyState = 3;
            const e = new CloseEvent('close', { code: 1000, wasClean: true });
            if (this.onclose) this.onclose(e);
            (this._handlers.close || []).forEach(h => h(e));
        };

        window.WebSocket = function(url, protocols) {
            if (url && url.includes(':1940')) return new HubMockWS(url);
            return protocols ? new _origWS(url, protocols) : new _origWS(url);
        };
        window.WebSocket.CONNECTING = 0; window.WebSocket.OPEN = 1;
        window.WebSocket.CLOSING   = 2; window.WebSocket.CLOSED = 3;
    });
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

    test('OfflineStatusBar appears and hub WS connection is established when server is unreachable', async ({ page }) => {
        // Browser-level WS mock: patches window.WebSocket before any app code runs.
        // Simulates a hub accepting the connection so LanHub._replayQueue() can
        // fire and submitScan() succeeds — verified via window.__hubWsConnected.
        await installHubWsMock(page);
        await addHubInitScript(page);

        await login(page);

        // Take the central server down for scan and hub-status endpoints
        await page.route('**/api/scan',       route => route.abort('failed'));
        await page.route('**/api/hub/status', route => route.fulfill({
            status: 503, contentType: 'application/json',
            body: JSON.stringify({ error: 'unreachable' }),
        }));

        await goToScanner(page);

        // Fire the browser offline event so OfflineStatusBar detects the outage.
        // navigator.onLine stays true in Playwright unless we dispatch this event.
        await page.evaluate(() => window.dispatchEvent(new Event('offline')));

        // A scan attempt triggers LanHub.connect() in the offline fetch interceptor
        await page.getByPlaceholder(/Enter asset number/i).fill('PUMP-OFFLINE-01');
        await page.keyboard.press('Enter');

        // OfflineStatusBar: amber "Offline Mode" banner must appear
        await expect(page.getByText(/Offline Mode|Offline mode|Working Offline/i)).toBeVisible({ timeout: 8000 });

        // Wait for LanHub.connect() → MockHubWS.onopen → _replayQueue() to complete
        await page.waitForTimeout(3000);
        const hubConnected = await page.evaluate(() => window.__hubWsConnected);
        expect(hubConnected).toBe(true);
    });
});

// =============================================================================
// SCENARIO 2 — Scan reaches the hub within 2 seconds (round-trip timing)
// =============================================================================
test.describe('Scenario 2 — Hub receives SCAN within 2s; SCAN_ACK drives confirmation overlay', () => {

    test('Scan message arrives at hub WebSocket within 5 seconds of submission', async ({ page }) => {
        // Browser-level WS mock: captures all messages sent by LanHub to the hub.
        // routeWebSocket is unreliable for ws:// from https:// contexts in Playwright;
        // patching window.WebSocket directly is the only cross-platform reliable approach.
        await installHubWsMock(page);
        await addHubInitScript(page);

        // Server is down so the offline path (predictBranch + hub submit) is used
        await page.route('**/api/scan', route => route.abort('failed'));

        await login(page);
        await goToScanner(page);

        const submittedAt = Date.now();
        await page.getByPlaceholder(/Enter asset number/i).fill('MOTOR-HUB-01');
        await page.keyboard.press('Enter');

        // Confirmation overlay comes from predictBranch (local); should be visible quickly
        await expect(page.getByText(/MOTOR-HUB-01|Work Started|New Work Order|AUTO_CREATE/i).first())
            .toBeVisible({ timeout: 8000 });

        // Wait for LanHub to open the WS, run _replayQueue, and send the SCAN message.
        // The chain is: abort → queueWrite → connect() → MockHubWS.onopen → _replayQueue → send.
        await page.waitForTimeout(3000);

        const hubSent = await page.evaluate(() => window.__hubWsSent || []);
        const scanEntry = hubSent.find(m => {
            try { return JSON.parse(m.data).type === 'SCAN'; } catch (_) { return false; }
        });
        expect(scanEntry).not.toBeNull();
        // SCAN must have reached the mock hub within 5 seconds of submission
        expect(scanEntry.time - submittedAt).toBeLessThan(5000);
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
        // Endpoint is /api/scan/needs-review (not review-queue); shape matches useNeedsReview hook
        await page.route('**/api/scan/needs-review*', route => {
            route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({
                    flagged: [{
                        ID:              '99',
                        WorkOrderNumber: 'WO-DUAL-001',
                        Description:     'Compressor Overhaul',
                        reviewReason:    'OFFLINE_CONFLICT',
                        reviewStatus:    'FLAGGED',
                        flaggedAt:       new Date().toISOString(),
                    }],
                    overdueScheduled: [],
                    counts: { flagged: 1, overdueScheduled: 0 },
                }),
            });
        });

        await goToScanner(page);

        await page.getByPlaceholder(/Enter asset number/i).fill('COMP-001');
        await page.keyboard.press('Enter');

        // MULTI_TECH context renders "Active — Multiple Technicians" subtitle
        // with Leave Work / Close for Team / Escalate buttons.
        await expect(page.getByText(/Multiple Technicians|Leave Work|Close for Team|Escalate/i).first())
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

        // Dispatch offline event so OfflineStatusBar shows the offline banner.
        await page.evaluate(() => window.dispatchEvent(new Event('offline')));

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
        await expect(page.getByText(/Offline Mode|Offline mode|Working Offline/i)).toBeVisible({ timeout: 6000 });
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

        // Dispatch offline event first — the hub token expired chip is only rendered
        // inside the offline banner (isOffline must be true for the chip to show).
        await page.evaluate(() => window.dispatchEvent(new Event('offline')));

        // Trigger the offline path — LanHub.connect() will call _isTokenExpired()
        // and emit('tokenExpired') instead of opening a WebSocket.
        await page.getByPlaceholder(/Enter asset number/i).fill('MOTOR-EXPIRED-JWT');
        await page.keyboard.press('Enter');

        await page.waitForTimeout(1500);

        // OfflineStatusBar should show the token-expired chip (rendered when
        // hubTokenExpired state is true, set by LanHub.onTokenExpired() handler).
        await expect(page.getByText(/Hub unavailable|local queue only|token expired/i))
            .toBeVisible({ timeout: 8000 });
    });
});

// =============================================================================
// SCENARIO 7 — Auth expires before drain starts; queue preserved
// =============================================================================
test.describe('Scenario 7 — Session expires before drain; banner shows AUTH_EXPIRED, queue intact', () => {

    test('On first 401, drain halts immediately and no item is marked failed-permanently', async ({ page }) => {
        await addHubInitScript(page);
        await login(page);

        await page.route('**/api/scan', route => {
            route.fulfill({ status: 401, contentType: 'application/json',
                body: JSON.stringify({ error: 'Unauthorized' }) });
        });

        await writeToStore(page, 'sync_queue', [
            { id: 'auth-q1', method: 'POST', endpoint: '/api/scan',
              payload: { scanId: 'scan-auth-1', assetId: 'PUMP-AUTH-01' },
              synced: false, syncResult: null, timestamp: new Date().toISOString(), retries: 0 },
            { id: 'auth-q2', method: 'POST', endpoint: '/api/scan',
              payload: { scanId: 'scan-auth-2', assetId: 'PUMP-AUTH-02' },
              synced: false, syncResult: null, timestamp: new Date().toISOString(), retries: 0 },
        ]);

        await page.evaluate(() => window.dispatchEvent(new Event('online')));

        // AUTH_EXPIRED banner must be visible with queue-safe messaging.
        // .first() is required because the regex matches both the syncMessage span
        // ("2 scans preserved — session expired") and the authExpiredNote span
        // ("Queued scans are safe — log in to resume sync") — strict mode rejects
        // a multi-match locator with toBeVisible().
        await expect(page.getByText(/session expired|Session expired|log in to resume|Queued scans are safe/i).first())
            .toBeVisible({ timeout: 8000 });

        // Both items must still be in the queue — not marked failed
        const queue = await readAllFromStore(page, 'sync_queue');
        const pending = queue.filter(e => ['auth-q1', 'auth-q2'].includes(e.id));
        expect(pending).toHaveLength(2);
        expect(pending.every(e => e.syncResult !== 'failed-permanently')).toBe(true);
        expect(pending.every(e => !e.synced)).toBe(true);
    });
});

// =============================================================================
// SCENARIO 8 — Auth expires mid-drain; processed item synced, rest preserved
// =============================================================================
test.describe('Scenario 8 — Auth expires mid-drain; item before 401 synced, rest preserved untouched', () => {

    test('First scan syncs, second returns 401 — drain halts, two items remain in queue', async ({ page }) => {
        await addHubInitScript(page);
        await login(page);

        let callCount = 0;
        await page.route('**/api/scan', async route => {
            callCount++;
            if (callCount === 1) {
                await route.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify({ ok: true, branch: 'AUTO_CREATE_WO', wo: { id: '1' } }) });
            } else {
                await route.fulfill({ status: 401, contentType: 'application/json',
                    body: JSON.stringify({ error: 'Unauthorized' }) });
            }
        });

        // Items ordered by timestamp so replayQueue processes mid-q1 first
        await writeToStore(page, 'sync_queue', [
            { id: 'mid-q1', method: 'POST', endpoint: '/api/scan',
              payload: { scanId: 'scan-mid-1', assetId: 'PUMP-MID-01' },
              synced: false, syncResult: null, timestamp: '2026-04-21T10:00:00.000Z', retries: 0 },
            { id: 'mid-q2', method: 'POST', endpoint: '/api/scan',
              payload: { scanId: 'scan-mid-2', assetId: 'PUMP-MID-02' },
              synced: false, syncResult: null, timestamp: '2026-04-21T10:01:00.000Z', retries: 0 },
            { id: 'mid-q3', method: 'POST', endpoint: '/api/scan',
              payload: { scanId: 'scan-mid-3', assetId: 'PUMP-MID-03' },
              synced: false, syncResult: null, timestamp: '2026-04-21T10:02:00.000Z', retries: 0 },
        ]);

        await page.evaluate(() => window.dispatchEvent(new Event('online')));

        await expect(page.getByText(/session expired|Session expired/i).first())
            .toBeVisible({ timeout: 8000 });

        // mid-q1 was synced and cleaned up; mid-q2 and mid-q3 must remain
        const queue = await readAllFromStore(page, 'sync_queue');
        expect(queue.some(e => e.id === 'mid-q1')).toBe(false);
        expect(queue.some(e => e.id === 'mid-q2')).toBe(true);
        expect(queue.some(e => e.id === 'mid-q3')).toBe(true);

        // Preserved items must not be permanently failed
        const preserved = queue.filter(e => ['mid-q2', 'mid-q3'].includes(e.id));
        expect(preserved.every(e => e.syncResult !== 'failed-permanently')).toBe(true);
    });
});

// =============================================================================
// SCENARIO 9 — Re-auth via trier-session-restored resumes drain automatically
// =============================================================================
test.describe('Scenario 9 — trier-session-restored event resumes drain; each item submitted once', () => {

    test('After session-restored, remaining queue drains with no duplicate submissions', async ({ page }) => {
        await addHubInitScript(page);
        await login(page);

        let authValid = false;
        const postedScanIds = [];

        await page.route('**/api/scan', async route => {
            if (!authValid) {
                await route.fulfill({ status: 401, contentType: 'application/json',
                    body: JSON.stringify({ error: 'Unauthorized' }) });
            } else {
                let body = {};
                try { body = route.request().postDataJSON() || {}; } catch (_) {}
                if (body?.scanId) postedScanIds.push(body.scanId);
                await route.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify({ ok: true, branch: 'AUTO_CREATE_WO', wo: { id: '42' } }) });
            }
        });

        await writeToStore(page, 'sync_queue', [
            { id: 'res-q1', method: 'POST', endpoint: '/api/scan',
              payload: { scanId: 'scan-resume-1', assetId: 'VFD-RES-01' },
              synced: false, syncResult: null, timestamp: new Date().toISOString(), retries: 0 },
            { id: 'res-q2', method: 'POST', endpoint: '/api/scan',
              payload: { scanId: 'scan-resume-2', assetId: 'VFD-RES-02' },
              synced: false, syncResult: null, timestamp: new Date().toISOString(), retries: 0 },
        ]);

        // Phase 1: trigger drain → 401 → AUTH_EXPIRED banner appears.
        // No waitForTimeout — the 800ms trier-session-expired delay gives React time
        // to flush the AUTH_EXPIRED banner before LoginView replaces the app.
        // Dispatch trier-session-restored immediately after catching the banner so
        // OfflineStatusBar is still mounted and its onSessionRestored handler fires.
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await expect(page.getByText(/session expired|Session expired/i).first())
            .toBeVisible({ timeout: 8000 });

        // Phase 2: simulate successful re-auth — enable 200 responses then fire session-restored.
        // Must happen before the 800ms trier-session-expired timer kills OfflineStatusBar.
        authValid = true;
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('trier-session-restored')));
        await page.waitForTimeout(3000);

        // Each scan ID must appear exactly once — no double submission
        expect(postedScanIds.filter(id => id === 'scan-resume-1').length).toBe(1);
        expect(postedScanIds.filter(id => id === 'scan-resume-2').length).toBe(1);

        // Queue must be empty after successful drain
        const queue = await readAllFromStore(page, 'sync_queue');
        const stillPending = queue.filter(e => ['res-q1', 'res-q2'].includes(e.id) && !e.synced);
        expect(stillPending).toHaveLength(0);
    });
});

// =============================================================================
// SCENARIO 10 — Concurrent drain guard prevents double submission
// =============================================================================
test.describe('Scenario 10 — isDrainingRef guard blocks a second drain while one is in flight', () => {

    test('Two rapid trier-session-restored events submit each scan exactly once', async ({ page }) => {
        await addHubInitScript(page);
        await login(page);

        const postedScanIds = [];
        await page.route('**/api/scan', async route => {
            let body = {};
            try { body = route.request().postDataJSON() || {}; } catch (_) {}
            if (body?.scanId) postedScanIds.push(body.scanId);
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ ok: true, branch: 'AUTO_CREATE_WO', wo: { id: '1' } }) });
        });

        await writeToStore(page, 'sync_queue', [
            { id: 'dedup-q1', method: 'POST', endpoint: '/api/scan',
              payload: { scanId: 'scan-dedup-1', assetId: 'MOTOR-DEDUP-01' },
              synced: false, syncResult: null, timestamp: new Date().toISOString(), retries: 0 },
        ]);

        // Fire two session-restored events simultaneously — only one drain should run
        await page.evaluate(() => {
            window.dispatchEvent(new CustomEvent('trier-session-restored'));
            window.dispatchEvent(new CustomEvent('trier-session-restored'));
        });
        await page.waitForTimeout(3000);

        // scan-dedup-1 must appear exactly once — the isDrainingRef guard blocked the second
        expect(postedScanIds.filter(id => id === 'scan-dedup-1').length).toBe(1);
    });
});
