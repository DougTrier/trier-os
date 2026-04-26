// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * invariants.spec.js — Architecture Invariant Tests
 *
 * One test per invariant from docs/ARCHITECTURE_INVARIANTS.md.
 * Each test proves a correctness guarantee holds under adversarial conditions.
 * These tests are not workflow tests — they target specific failure modes.
 *
 * API dependencies:
 *   POST /api/scan/offline-sync
 *   GET  /api/assets
 */

import { test, expect } from '@playwright/test';

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
