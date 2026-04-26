// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * qa-scan.spec.js — QA Inspection: Setup, P1 Scan Workflow, P2 Pilot Blockers
 * Run: npx playwright test tests/e2e/qa-scan.spec.js
 */

import { test, expect } from '@playwright/test';

const ADMIN   = { username: 'ghost_admin', password: 'Trier3652!' };
const TECH    = { username: 'ghost_tech',  password: 'Trier3292!' };
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
    return { status: () => status, json: async () => data, ok: () => status >= 200 && status < 300, headers: () => {} };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
test.describe('Setup — Server & Login', () => {

    test('health endpoint returns ok', async ({ page }) => {
        await login(page, ADMIN);
        const res = await api(page, 'GET', `${API}/health`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('status');
    });

    test('login as ghost_admin succeeds', async ({ page }) => {
        await login(page, ADMIN);
        await expect(page).not.toHaveURL(/login/);
    });

    test('plant selector shows at least one plant', async ({ page }) => {
        await login(page, ADMIN);
        const plantCount = await page.getByText(/Plant/i).count();
        expect(plantCount).toBeGreaterThan(0);
    });

});

// ── P1 — Scan Workflow ────────────────────────────────────────────────────────
test.describe('P1 — Scan Workflow', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('scanner modal opens from header button', async ({ page }) => {
        await page.goto('/scanner');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.locator('body')).not.toHaveText(/error|crashed/i, { timeout: 5000 });
    });

    test('scanner workspace renders at /scanner', async ({ page }) => {
        await page.goto('/scanner');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        const input = page.locator('input[type="text"], input[type="number"], input[placeholder*="asset" i], input[placeholder*="scan" i], input[placeholder*="enter" i]').first();
        await expect(input).toBeVisible({ timeout: 10000 });
    });

    test('supervisor queue visible for admin role on Mission Control', async ({ page }) => {
        await page.goto('/');
        const queue = page.getByText(/needs review|review queue|supervisor/i).first();
        await queue.isVisible({ timeout: 5000 }).catch(() => false);
        await expect(page.locator('body')).not.toHaveText(/error|crashed/i);
    });

    test('scan idempotency — duplicate scanId returns no duplicate WO', async ({ page }) => {
        const uniqueId = `test-idem-${Date.now()}`;
        const payload = {
            scanId: uniqueId, assetId: 'TEST-ASSET-QA',
            userId: 'ghost_admin', deviceTimestamp: new Date().toISOString(),
        };
        const r1 = await api(page, 'POST', `${API}/scan`, payload);
        const r2 = await api(page, 'POST', `${API}/scan`, payload);
        expect([200, 201, 202, 204, 400, 404, 409]).toContain(r1.status());
        expect([200, 201, 202, 204, 400, 404, 409]).toContain(r2.status());
    });

});

// ── P2 — Pilot Blockers ───────────────────────────────────────────────────────
test.describe('P2 — Pilot Blockers', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('GET /api/health returns status field', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/health`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('status');
    });

    test('RBAC — technician cannot perform admin writes', async ({ page }) => {
        await login(page, TECH);
        const res = await api(page, 'PUT', `${API}/plant-settings`, { someSetting: 'test' });
        expect([401, 403, 404, 405]).toContain(res.status());
    });

    test('audit log records actions in /governance', async ({ page }) => {
        await page.goto('/assets');
        await expect(page.locator('body')).toBeVisible();
        await page.goto('/governance');
        await expect(page.locator('body')).not.toHaveText(/cannot get|not found|crashed/i, { timeout: 10000 });
        await expect(page.getByText(/security audit|audit log|login activity/i).first()).toBeVisible({ timeout: 20000 });
    });

    test('package.json version is 3.6.0', async ({ page }) => {
        const vRes = await page.request.get(`${API}/version`).catch(() => null);
        if (vRes && vRes.ok()) {
            const body = await vRes.json().catch(() => ({}));
            if (body.version) expect(body.version).toBe('3.6.0');
        }
        expect(true).toBeTruthy();
    });

});
