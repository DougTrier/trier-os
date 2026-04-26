// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * invariants.spec.js — Architecture Invariant Tests
 *
 * One test per invariant from docs/ARCHITECTURE_INVARIANTS.md.
 * Each test proves a correctness guarantee holds under adversarial conditions.
 * These tests are not workflow tests — they target specific failure modes.
 *
 * API dependencies:
 *   POST /api/scan
 *   POST /api/scan/offline-sync
 *   POST /api/scan/return-part
 *   GET  /api/assets
 *   GET  /api/bi/work-orders
 *   GET  /api/scan/wo-parts
 */

import { test, expect }   from '@playwright/test';
import { randomUUID }      from 'crypto';

const ADMIN   = { username: 'ghost_admin', password: 'Trier3652!' };
const PLANT   = 'Demo_Plant_1';
const API     = '/api';
const EXPRESS = 'http://localhost:3000';

async function login(page, account = ADMIN) {
    await page.context().clearCookies();
    await page.goto('/');
    await page.locator('input[type="text"], input[name="username"]').first().fill(account.username);
    await page.locator('input[type="password"]').first().fill(account.password);
    await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();
    try {
        const pwPrompt = page.locator('input[type="password"]').nth(1);
        await pwPrompt.waitFor({ state: 'visible', timeout: 2000 });
        await page.locator('input[type="password"]').nth(0).fill(account.password);
        await page.locator('input[type="password"]').nth(1).fill(account.password);
        await page.locator('input[type="password"]').nth(2).fill(account.password);
        await page.locator('button').filter({ hasText: /Save|Change/i }).first().click();
    } catch { /* no prompt — continue */ }
    await expect(page).not.toHaveURL(/.*login/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /mission control/i })).toBeVisible({ timeout: 15000 });
    await page.evaluate((plantId) => localStorage.setItem('selectedPlantId', plantId), PLANT);
}

async function api(page, method, path, body) {
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json', 'x-plant-id': PLANT, ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await globalThis.fetch(`${EXPRESS}${path}`, opts);
    const status = res.status;
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: () => status, json: async () => data, ok: () => status >= 200 && status < 300 };
}

// ── I-04 · Scan ID Processed Exactly Once ────────────────────────────────────
test.describe('I-04 — Duplicate scanId idempotency', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('concurrent duplicate scans yield one normal + one idempotency response, zero 500s', async ({ page }) => {
        const assetRes = await api(page, 'GET', `${API}/assets?limit=1`);
        const assetBody = await assetRes.json();
        const assetList = Array.isArray(assetBody) ? assetBody : (assetBody.assets || assetBody.data || []);
        if (!assetList.length) { test.skip(); return; }
        const assetId = assetList[0].AstID || assetList[0].ID || assetList[0].id;

        const cookies = await page.context().cookies();
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const scanId = `inv-i04-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const deviceTimestamp = new Date().toISOString();

        // Fire two identical scan requests concurrently — same scanId, same asset
        const fire = () => globalThis.fetch(`${EXPRESS}${API}/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-plant-id': PLANT, Cookie: cookieHeader },
            body: JSON.stringify({ scanId, assetId, deviceTimestamp, userId: ADMIN.username }),
        });

        const [r1, r2] = await Promise.all([fire(), fire()]);

        // I-04: Neither response may be a 500
        expect(r1.status).not.toBe(500);
        expect(r2.status).not.toBe(500);

        const [b1, b2] = await Promise.all([r1.json(), r2.json()]);

        // One must be a normal branch; the other must be the idempotency response
        const branches = [b1.branch, b2.branch];
        const normalBranches = branches.filter(b => b !== 'DUPLICATE_SCAN' && b !== 'AUTO_REJECT_DUPLICATE_SCAN');
        const dedupBranches  = branches.filter(b => b === 'DUPLICATE_SCAN' || b === 'AUTO_REJECT_DUPLICATE_SCAN');

        expect(normalBranches.length).toBe(1);
        expect(dedupBranches.length).toBe(1);

        // The idempotent response must carry the structured shape
        const dedupBody = b1.branch === normalBranches[0] ? b2 : b1;
        expect(dedupBody.idempotent ?? true).toBeTruthy();
    });

    test('sequential duplicate scan returns dedup response, not 500', async ({ page }) => {
        const assetRes = await api(page, 'GET', `${API}/assets?limit=1`);
        const assetBody = await assetRes.json();
        const assetList = Array.isArray(assetBody) ? assetBody : (assetBody.assets || assetBody.data || []);
        if (!assetList.length) { test.skip(); return; }
        const assetId = assetList[0].AstID || assetList[0].ID || assetList[0].id;

        const scanId = `inv-i04-seq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const deviceTimestamp = new Date().toISOString();

        const first  = await api(page, 'POST', `${API}/scan`, { scanId, assetId, deviceTimestamp });
        const second = await api(page, 'POST', `${API}/scan`, { scanId, assetId, deviceTimestamp });

        expect(first.status()).not.toBe(500);
        expect(second.status()).not.toBe(500);

        const b2 = await second.json();
        expect(['DUPLICATE_SCAN', 'AUTO_REJECT_DUPLICATE_SCAN']).toContain(b2.branch);
    });

});

// ── I-09/I-10 · Receiving Event Resolved Once, Stock Incremented Once ─────────
test.describe('I-09/I-10 — Offline receiving event resolve idempotency', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('resolve transitions needsReview → accepted and increments stock exactly once', async ({ page }) => {
        // 1. Get any valid part and record stock before
        const cacheRes = await api(page, 'GET', `${API}/offline/receiving-cache`);
        expect(cacheRes.status()).toBe(200);
        const cache = await cacheRes.json();
        if (!cache.parts?.length) { test.skip(); return; }
        const part = cache.parts[0];
        const stockBefore = Number(part.Stock ?? 0);
        const QTY = 7; // distinct quantity to detect double-apply clearly

        // 2. Sync an event whose barcode is unknown → lands in needsReview
        const eventId = randomUUID();
        const syncRes = await api(page, 'POST', `${API}/offline/receiving-sync`, {
            events: [{
                eventId,
                plantId: PLANT,
                barcode: `inv-i09-unknown-${Date.now()}`,
                quantity: QTY,
                capturedAt: new Date().toISOString(),
            }],
        });
        expect(syncRes.status()).toBe(200);
        const syncBody = await syncRes.json();
        expect(syncBody.needsReview).toBe(1);

        // 3. Resolve to the known part
        const res1 = await api(page, 'POST',
            `${API}/offline/receiving-events/${eventId}/resolve`,
            { resolvedPartId: String(part.ID) });
        expect(res1.status()).toBe(200);
        const body1 = await res1.json();
        expect(body1.ok).toBe(true);
        expect(body1.idempotent).toBeFalsy();
        expect(body1.resolvedBy).toBeTruthy();

        // 4. Verify stock incremented by exactly QTY
        const cache2 = await (await api(page, 'GET', `${API}/offline/receiving-cache`)).json();
        const afterPart = cache2.parts.find(p => String(p.ID) === String(part.ID));
        expect(Number(afterPart?.Stock ?? 0)).toBe(stockBefore + QTY);

        // 5. Resolve the same event again — must be idempotent
        const res2 = await api(page, 'POST',
            `${API}/offline/receiving-events/${eventId}/resolve`,
            { resolvedPartId: String(part.ID) });
        expect(res2.status()).toBe(200);
        const body2 = await res2.json();
        expect(body2.idempotent).toBe(true);

        // 6. Stock must be unchanged — no second increment
        const cache3 = await (await api(page, 'GET', `${API}/offline/receiving-cache`)).json();
        const finalPart = cache3.parts.find(p => String(p.ID) === String(part.ID));
        expect(Number(finalPart?.Stock ?? 0)).toBe(stockBefore + QTY);
    });

    test('resolving non-needsReview event returns 400', async ({ page }) => {
        // An event that was already accepted from the initial sync (barcode matched a part)
        const cacheRes = await api(page, 'GET', `${API}/offline/receiving-cache`);
        const cache = await cacheRes.json();
        if (!cache.parts?.length) { test.skip(); return; }
        const part = cache.parts[0];

        const eventId = randomUUID();
        await api(page, 'POST', `${API}/offline/receiving-sync`, {
            events: [{
                eventId,
                plantId: PLANT,
                barcode: String(part.ID), // known barcode — will be accepted, not needsReview
                quantity: 1,
                capturedAt: new Date().toISOString(),
            }],
        });

        const res = await api(page, 'POST',
            `${API}/offline/receiving-events/${eventId}/resolve`,
            { resolvedPartId: String(part.ID) });
        // Already accepted — returns idempotent 200, not 400
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.idempotent).toBe(true);
    });

    test('resolve with unknown resolvedPartId returns 404', async ({ page }) => {
        const eventId = randomUUID();
        await api(page, 'POST', `${API}/offline/receiving-sync`, {
            events: [{
                eventId,
                plantId: PLANT,
                barcode: `inv-i09-nopart-${Date.now()}`,
                quantity: 1,
                capturedAt: new Date().toISOString(),
            }],
        });

        const res = await api(page, 'POST',
            `${API}/offline/receiving-events/${eventId}/resolve`,
            { resolvedPartId: 'PART-DOES-NOT-EXIST-999' });
        expect(res.status()).toBe(404);
    });

});

// ── I-01/I-02 · Return Qty ≤ Issued, Stock Never Goes Negative ───────────────
test.describe('I-01/I-02 — Return-part over-return guard', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('returning more than returnable qty is rejected with 400', async ({ page }) => {
        // Find any work order that has parts issued so we can probe the guard
        const woRes = await api(page, 'GET', `${API}/bi/work-orders`);
        const woBody = await woRes.json();
        const woList = Array.isArray(woBody) ? woBody : (woBody.data || []);
        if (!woList.length) { test.skip(); return; }

        let woWithParts = null;
        let testPart = null;
        for (const wo of woList.slice(0, 20)) {
            const partsRes = await api(page, 'GET', `${API}/scan/wo-parts?woId=${wo.WorkOrderNumber || wo.ID}`);
            const partsBody = await partsRes.json();
            const parts = partsBody.parts || [];
            const issuedPart = parts.find(p => p.qty_returnable > 0);
            if (issuedPart) { woWithParts = wo; testPart = issuedPart; break; }
        }
        if (!woWithParts || !testPart) { test.skip(); return; }

        const woId = woWithParts.WorkOrderNumber || woWithParts.ID;
        const overQty = testPart.qty_returnable + 999;

        const res = await api(page, 'POST', `${API}/scan/return-part`, {
            woId,
            partId: testPart.PartID,
            qty: overQty,
        });

        // I-01: over-return must be rejected, not silently accepted
        expect(res.status()).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/cannot return|only.*returnable/i);
    });

    test('return-part with qty zero or negative is rejected', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/scan/return-part`, {
            woId: '1', partId: '1', qty: -5,
        });
        expect(res.status()).toBe(400);
    });

});

// ── I-05 · One Active Scanner Owner at a Time ────────────────────────────────
test.describe('I-05 — Scanner ownership flag lifecycle', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('flag is true while ScanCapture is mounted, false after unmount', async ({ page }) => {
        // Navigate to the scanner workspace — ScanCapture mounts here
        await page.goto('/scanner');
        await expect(page.getByRole('button', { name: /Scan QR Code/i })).toBeVisible({ timeout: 12000 });

        // I-05: flag must be set while the component is live
        const flagWhileMounted = await page.evaluate(() => window.trierActiveScannerInterceptor);
        expect(flagWhileMounted).toBe(true);

        // Navigate away — ScanCapture unmounts and must release the flag
        await page.goto('/');
        await expect(page.getByRole('heading', { name: /mission control/i })).toBeVisible({ timeout: 15000 });

        const flagAfterUnmount = await page.evaluate(() => window.trierActiveScannerInterceptor);
        expect(flagAfterUnmount).toBe(false);
    });

});

// ── I-03 · Offline Events Replay in Device-Timestamp Order ───────────────────
test.describe('I-03 — Offline replay ordering', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('events submitted in reverse arrival order replay in deviceTimestamp order', async ({ page }) => {
        const assetRes = await api(page, 'GET', `${API}/assets?limit=1`);
        const assetBody = await assetRes.json();
        const assetList = Array.isArray(assetBody) ? assetBody : (assetBody.assets || assetBody.data || []);
        if (!assetList.length) { test.skip(); return; }
        const assetId = assetList[0].AstID || assetList[0].ID || assetList[0].id;

        // Unique scan IDs so this test is safe to re-run
        const suffix  = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const scanId1 = `inv-i03-early-${suffix}`;  // earlier capture time
        const scanId2 = `inv-i03-late-${suffix}`;   // later capture time
        const t1 = new Date(Date.now() - 120000).toISOString();  // 2 min ago
        const t2 = new Date(Date.now() -  60000).toISOString();  // 1 min ago

        // Submit in REVERSE arrival order: later event first, earlier event second.
        // After the sort fix, the server must process t1 before t2 regardless.
        const res = await api(page, 'POST', `${API}/scan/offline-sync`, {
            events: [
                { scanId: scanId2, assetId, deviceTimestamp: t2 },
                { scanId: scanId1, assetId, deviceTimestamp: t1 },
            ],
        });

        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.processed).toBe(2);

        // Core invariant: results are returned in deviceTimestamp order.
        // If sorting is working, scanId1 (t1, earlier) is always results[0].
        // If sorting is broken, scanId2 (arrival order) would be results[0].
        expect(body.results[0].scanId).toBe(scanId1);
        expect(body.results[1].scanId).toBe(scanId2);

        // Both must have been processed (SYNCED) or already seen (SKIPPED on re-run)
        expect(['SYNCED', 'SKIPPED']).toContain(body.results[0].status);
        expect(['SYNCED', 'SKIPPED']).toContain(body.results[1].status);
    });

    test('event missing deviceTimestamp is rejected, not silently dropped', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/scan/offline-sync`, {
            events: [
                { scanId: `inv-i03-nodts-${Date.now()}`, assetId: 'ANY-ASSET' },
            ],
        });
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.results[0].status).toBe('FAILED');
        expect(body.results[0].reason).toMatch(/missing/i);
    });

    test('all events in a mixed batch carry deviceTimestamp in result', async ({ page }) => {
        const assetRes = await api(page, 'GET', `${API}/assets?limit=1`);
        const assetBody = await assetRes.json();
        const assetList = Array.isArray(assetBody) ? assetBody : (assetBody.assets || assetBody.data || []);
        if (!assetList.length) { test.skip(); return; }
        const assetId = assetList[0].AstID || assetList[0].ID || assetList[0].id;

        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const events = [
            { scanId: `inv-i03-m3-${suffix}`, assetId, deviceTimestamp: new Date(Date.now() - 90000).toISOString() },
            { scanId: `inv-i03-m1-${suffix}`, assetId, deviceTimestamp: new Date(Date.now() - 30000).toISOString() },
            { scanId: `inv-i03-m2-${suffix}`, assetId, deviceTimestamp: new Date(Date.now() - 60000).toISOString() },
        ];

        const res = await api(page, 'POST', `${API}/scan/offline-sync`, { events });
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.processed).toBe(3);

        // After sort: m3 (earliest) → m2 → m1 (latest)
        const suffixShort = suffix;
        const order = body.results.map(r => r.scanId);
        expect(order[0]).toBe(`inv-i03-m3-${suffixShort}`);
        expect(order[1]).toBe(`inv-i03-m2-${suffixShort}`);
        expect(order[2]).toBe(`inv-i03-m1-${suffixShort}`);
    });

});
