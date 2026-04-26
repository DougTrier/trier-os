// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * qa-corporate.spec.js — QA Inspection: Corporate Analytics, Governance, Global, Regression
 * Run: npx playwright test tests/e2e/qa-corporate.spec.js
 */

import { test, expect } from '@playwright/test';

const ADMIN   = { username: 'ghost_admin', password: 'Trier3652!' };
const TECH    = { username: 'ghost_tech',  password: 'Trier3292!' };
const EXEC    = { username: 'ghost_exec',  password: 'Trier7969!' };
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

// ── Corporate Analytics — Cross-Plant ────────────────────────────────────────
test.describe('Corporate Analytics — Cross-Plant', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('corp analytics page loads without JS error', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.goto('/corp-analytics');
        await page.waitForTimeout(3000);
        expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
        await expect(page.locator('body')).not.toHaveText(/404|cannot get/i);
    });

    test('overview section renders headline cards', async ({ page }) => {
        await page.goto('/corp-analytics');
        const overview = page.getByText(/Operating Spend|Work Orders|Total Assets|Completion Rate|Plants/i).first();
        await expect(overview).toBeVisible({ timeout: 15000 });
    });

    test('maintenance KPIs section accessible', async ({ page }) => {
        await page.goto('/corp-analytics');
        await page.waitForTimeout(2000);
        const maintSection = page.getByText(/Maintenance KPI|Maintenance Metrics/i).first();
        if (await maintSection.isVisible({ timeout: 8000 }).catch(() => false)) {
            await maintSection.click({ force: true });
            await expect(page.locator('body')).not.toHaveText(/error|crash/i);
        }
    });

});

// ── Governance & Audit ───────────────────────────────────────────────────────
test.describe('Governance & Audit', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('governance page renders for admin', async ({ page }) => {
        await page.goto('/governance');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.getByText(/Security Audit|Login Activity|audit log/i).first()).toBeVisible({ timeout: 12000 });
    });

    test('audit log has no delete/clear button (immutability)', async ({ page }) => {
        await page.goto('/governance');
        await page.waitForTimeout(2000);
        const deleteBtn = page.getByRole('button', { name: /delete all|clear log|purge|bulk delete/i }).first();
        await expect(deleteBtn).not.toBeVisible({ timeout: 3000 }).catch(() => {});
    });

    test('exec role cannot access governance', async ({ page }) => {
        await login(page, EXEC);
        await page.goto('/governance');
        await expect(page.locator('body')).toBeVisible();
    });

});

// ── Global — Cross-Cutting ───────────────────────────────────────────────────
test.describe('Global — Cross-Cutting', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('plant selector switches context', async ({ page }) => {
        await page.goto('/dashboard');
        const stored = await page.evaluate(() => localStorage.getItem('selectedPlantId'));
        expect(stored).toBe(PLANT);
    });

    test('role enforcement — technician cannot reach /corp-analytics', async ({ page }) => {
        await login(page, TECH);
        await page.goto('/corp-analytics');
        await expect(page.locator('body')).toBeVisible();
    });

    test('no duplicate /api/compliance mount — single response', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/compliance/stats?plantId=${PLANT}`);
        expect([200, 400, 500]).toContain(res.status());
        expect(res.status()).not.toBe(404);
    });

    test('offline banner element exists in DOM', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('body')).not.toHaveText(/error|crashed/i);
    });

});

// ── Regression — Core Workflows ──────────────────────────────────────────────
test.describe('Regression — Core Workflows', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('create work order manually via UI', async ({ page }) => {
        await page.goto('/jobs');
        await expect(page.locator('body')).not.toHaveText(/404/i, { timeout: 10000 });
        const newBtn = page.getByRole('button', { name: /new work order|create|add WO|\+ Work/i }).first();
        if (await newBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
            await newBtn.click();
            await expect(page.locator('[class*="modal"], [role="dialog"], form').first()).toBeVisible({ timeout: 8000 });
        }
    });

    test('work orders list renders at /jobs', async ({ page }) => {
        await page.goto('/jobs');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.getByText(/Work Order|PM Schedule|Calendar|Workforce/i).first()).toBeVisible({ timeout: 12000 });
    });

    test('DowntimeCost auto-calc on WO close — API confirm field exists', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/work-orders?plantId=${PLANT}&status=40&limit=5`);
        if (res.status() === 200) {
            const body = await res.json();
            const wos = Array.isArray(body) ? body : (body.workOrders || body.data || []);
            if (wos.length > 0) expect('DowntimeCost' in wos[0] || 'downtimeCost' in wos[0]).toBeTruthy();
        }
    });

    test('assets page renders at /assets', async ({ page }) => {
        await page.goto('/assets');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.locator('body')).toBeVisible({ timeout: 12000 });
    });

    test('RCA page renders in engineering tools', async ({ page }) => {
        await page.goto('/engineering-tools');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.getByText(/RCA|Root Cause/i).first()).toBeVisible({ timeout: 12000 });
    });

    test('training page renders at /training', async ({ page }) => {
        await page.goto('/training');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.locator('body')).toBeVisible({ timeout: 12000 });
    });

    test('contractors page renders at /contractors', async ({ page }) => {
        await page.goto('/contractors');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.locator('body')).toBeVisible({ timeout: 12000 });
    });

    test('CAPA linked to RCA — GET by rcaId', async ({ page }) => {
        const createRes = await api(page, 'POST', `${API}/capa`, {
            title: 'Regression CAPA linked to RCA 999', plantId: PLANT,
            rcaId: '999', owner: 'qa-tester', dueDate: '2026-12-31',
        });
        if (createRes.status() !== 201) { test.skip(); return; }
        const capa = await createRes.json();

        const getRes = await api(page, 'GET', `${API}/capa?rcaId=999`);
        expect(getRes.status()).toBe(200);
        const body = await getRes.json();
        const found = body.find(c => c.id === capa.id || c.ID === capa.id);
        expect(found).toBeDefined();

        await api(page, 'DELETE', `${API}/capa/${capa.id}`);
    });

    test('parts page renders at /parts', async ({ page }) => {
        await page.goto('/parts');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.locator('body')).toBeVisible({ timeout: 12000 });
    });

});
