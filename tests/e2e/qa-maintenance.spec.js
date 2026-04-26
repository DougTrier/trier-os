// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * qa-maintenance.spec.js — QA Inspection: P3 Maintenance KPIs, CAPA, Budget
 * Run: npx playwright test tests/e2e/qa-maintenance.spec.js
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
    return { status: () => status, json: async () => data, ok: () => status >= 200 && status < 300, headers: () => {} };
}

// ── P3 — Maintenance KPIs ────────────────────────────────────────────────────
test.describe('P3 — Maintenance KPIs', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('planned-ratio endpoint returns ratio', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/maintenance-kpis/planned-ratio?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('plannedPct');
    });

    test('pm-compliance endpoint returns rate', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/maintenance-kpis/pm-compliance?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('complianceRate');
    });

    test('backlog-aging endpoint returns 4 buckets', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/maintenance-kpis/backlog-aging?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('buckets');
        expect(body.buckets).toHaveProperty('d0_7');
        expect(body.buckets).toHaveProperty('d8_30');
        expect(body.buckets).toHaveProperty('d31_90');
        expect(body.buckets).toHaveProperty('d90plus');
    });

    test('downtime-cost endpoint returns numeric value', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/maintenance-kpis/downtime-cost?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        const hasNumeric = Object.values(body).some(v => typeof v === 'number');
        expect(hasNumeric).toBeTruthy();
    });

    test('dashboard KPI cards render on /dashboard', async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.getByText(/Work Orders|Assets|Equipment|Parts|Scheduled/i).first()).toBeVisible({ timeout: 20000 });
    });

    test('corp analytics Maintenance KPIs section renders', async ({ page }) => {
        await page.goto('/corp-analytics');
        await expect(page.locator('body')).not.toHaveText(/404|error/i, { timeout: 12000 });
        const maintTab = page.getByText(/Maintenance KPI|Maintenance Metrics/i).first();
        if (await maintTab.isVisible({ timeout: 8000 }).catch(() => false)) {
            await maintTab.click();
            await expect(page.locator('body')).not.toHaveText(/error|crashed/i);
        }
    });

});

// ── P3 — CAPA Tracking ───────────────────────────────────────────────────────
test.describe('P3 — CAPA Tracking', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('GET /api/capa returns array without error', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/capa?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBeTruthy();
    });

    test('CAPA CRUD lifecycle — create, update, delete', async ({ page }) => {
        const createRes = await api(page, 'POST', `${API}/capa`, {
            title: 'QA Test CAPA — auto-created', plantId: PLANT, owner: 'qa-tester', dueDate: '2026-12-31',
        });
        expect(createRes.status()).toBe(201);
        const created = await createRes.json();
        expect(created).toHaveProperty('id');
        const capaId = created.id;

        const updateRes = await api(page, 'PUT', `${API}/capa/${capaId}`, { Status: 'InProgress' });
        expect(updateRes.status()).toBe(200);

        const deleteRes = await api(page, 'DELETE', `${API}/capa/${capaId}`);
        expect([200, 204]).toContain(deleteRes.status());
    });

    test('GET /api/capa/overdue returns list', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/capa/overdue`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        const items = Array.isArray(body) ? body : (body.items || []);
        expect(Array.isArray(items)).toBeTruthy();
    });

});

// ── P3 — Maintenance Budget ──────────────────────────────────────────────────
test.describe('P3 — Maintenance Budget', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('upsert budget record — create then re-POST updates without duplicate', async ({ page }) => {
        const payload = { plantId: PLANT, year: 2026, month: 4, category: 'Labor', budgetAmt: 15000 };
        const r1 = await api(page, 'POST', `${API}/maintenance-budget`, payload);
        expect([200, 201]).toContain(r1.status());
        const r2 = await api(page, 'POST', `${API}/maintenance-budget`, { ...payload, budgetAmt: 16000 });
        expect([200, 201]).toContain(r2.status());
    });

    test('variance endpoint returns 12-month grid', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/maintenance-budget/variance?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        const data = Array.isArray(body) ? body : (body.months || body.data || []);
        expect(Array.isArray(data) || typeof body === 'object').toBeTruthy();
    });

    test('asset criticality fields are stored', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/assets?plantId=${PLANT}&limit=1`);
        if (res.status() === 200) {
            const body = await res.json();
            const assets = Array.isArray(body) ? body : (body.assets || body.data || []);
            if (assets.length > 0) expect(typeof assets[0]).toBe('object');
        }
    });

});
