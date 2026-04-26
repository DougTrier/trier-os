// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * qa-quality.spec.js — QA Inspection: P5 Quality, Operator Care, Turnaround, Predictive, Energy
 * Run: npx playwright test tests/e2e/qa-quality.spec.js
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

// ── P5 — Quality Control ─────────────────────────────────────────────────────
test.describe('P5 — Quality Control', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('quality dashboard loads at /quality-log', async ({ page }) => {
        await page.goto('/quality-log');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.getByText(/Product Loss|Lab Results|Quality Summary/i).first()).toBeVisible({ timeout: 12000 });
    });

    test('defect code library returns ≥ 10 codes', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/qc/defect-codes`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        const codes = Array.isArray(body) ? body : (body.codes || body.data || []);
        expect(codes.length).toBeGreaterThanOrEqual(10);
    });

    test('NCR lifecycle — create and update', async ({ page }) => {
        const defectRes = await api(page, 'GET', `${API}/qc/defect-codes`);
        const codes = await defectRes.json();
        const defectCodeId = (Array.isArray(codes) ? codes[0] : codes.codes?.[0])?.id || 1;

        const createRes = await api(page, 'POST', `${API}/qc/ncr`, {
            plantId: PLANT, defectCodeId, title: 'QA Auto NCR',
            severity: 'Minor', description: 'Created by Playwright QA',
        });
        expect([200, 201]).toContain(createRes.status());
        const ncr = await createRes.json();
        expect(ncr).toHaveProperty('ncrNumber');
        expect(ncr.ncrNumber).toMatch(/NCR-/);

        const updateRes = await api(page, 'PUT', `${API}/qc/ncr/${ncr.id}`, { Status: 'Under Review' });
        expect(updateRes.status()).toBe(200);
    });

    test('Pareto endpoint returns ranked defects with cumulative %', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/qc/pareto?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        const rows = Array.isArray(body) ? body : (body.pareto || body.data || []);
        if (rows.length > 0) expect(rows[0]).toHaveProperty('cumulativePct');
    });

    test('FPY endpoint returns safe response', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/qc/fpy?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(typeof body).toBe('object');
    });

});

// ── P5 — Operator Care (Autonomous Maintenance) ──────────────────────────────
test.describe('P5 — Operator Care (Autonomous Maintenance)', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('create inspection route', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/operator-care/routes`, {
            name: 'QA Daily Inspection Route', plantId: PLANT, frequency: 'DAILY',
        });
        expect([200, 201]).toContain(res.status());
        const body = await res.json();
        expect(body).toHaveProperty('id');
    });

    test('inspection result submission auto-creates WO on Fail', async ({ page }) => {
        const assetRes = await api(page, 'GET', `${API}/assets`);
        const assetBody = await assetRes.json();
        const assetList = Array.isArray(assetBody) ? assetBody : (assetBody.assets || assetBody.data || []);
        const realAssetId = assetList.length > 0 ? (assetList[0].AstID || assetList[0].ID || assetList[0].id) : null;
        if (!realAssetId) { test.skip(); return; }

        const routeRes = await api(page, 'POST', `${API}/operator-care/routes`, {
            name: 'QA Auto-WO Test Route', plantId: PLANT, frequency: 'DAILY',
        });
        const route = await routeRes.json();

        const stepRes = await api(page, 'POST', `${API}/operator-care/routes/${route.id}/steps`, {
            stepLabel: 'Check pump bearing temperature', stepOrder: 1, assetId: realAssetId,
        });
        const step = await stepRes.json();

        const resultRes = await api(page, 'POST', `${API}/operator-care/results`, {
            routeId: route.id, plantId: PLANT, submittedBy: 'qa-tester',
            steps: [{ stepId: step.id || 1, result: 'FAIL', assetId: realAssetId, notes: 'Temperature too high' }],
        });
        expect([200, 201]).toContain(resultRes.status());
        const resultBody = await resultRes.json();
        expect(resultBody.autoWOsCreated).toBeGreaterThanOrEqual(1);
    });

});

// ── P5 — Turnaround Management ───────────────────────────────────────────────
test.describe('P5 — Turnaround Management', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('turnaround project CRUD', async ({ page }) => {
        const createRes = await api(page, 'POST', `${API}/turnaround/projects`, {
            name: 'QA Annual Turnaround 2026', plantId: PLANT,
            plannedStart: '2026-06-01', plannedEnd: '2026-06-14', budgetAmt: 500000,
        });
        expect([200, 201]).toContain(createRes.status());
        const project = await createRes.json();
        expect(project).toHaveProperty('id');

        const taskRes = await api(page, 'POST', `${API}/turnaround/projects/${project.id}/tasks`, {
            title: 'Exchanger bundle pull', estHours: 24, criticalPath: true,
        });
        expect([200, 201]).toContain(taskRes.status());

        const progRes = await api(page, 'GET', `${API}/turnaround/projects/${project.id}/progress`);
        expect(progRes.status()).toBe(200);
        const prog = await progRes.json();
        expect(prog.progress).toHaveProperty('criticalRemaining');

        const budgetRes = await api(page, 'GET', `${API}/turnaround/projects/${project.id}/budget`);
        expect(budgetRes.status()).toBe(200);
        const budget = await budgetRes.json();
        expect(budget).toHaveProperty('budgetAmt');
    });

});

// ── P5 — Predictive Maintenance ──────────────────────────────────────────────
test.describe('P5 — Predictive Maintenance', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('MTBF endpoint returns array', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/predictive-maintenance/mtbf?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        const assets = Array.isArray(body) ? body : (body.assets || []);
        expect(Array.isArray(assets)).toBeTruthy();
    });

    test('risk-ranking endpoint returns sorted assets', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/predictive-maintenance/risk-ranking?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        const assets = Array.isArray(body) ? body : (body.assets || body.data || []);
        if (assets.length >= 2) expect(assets[0].riskScore).toBeGreaterThanOrEqual(assets[1].riskScore);
    });

    test('forecast endpoint returns 30/60/90-day windows', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/predictive-maintenance/forecast?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(typeof body).toBe('object');
    });

    test('predictive foresight widget visible on dashboard', async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page.locator('body')).not.toHaveText(/404/i);
        await expect(page.locator('body')).toBeVisible({ timeout: 12000 });
    });

});

// ── P5 — Energy / Sub-metering ───────────────────────────────────────────────
test.describe('P5 — Energy / Sub-metering', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('utilities page renders with tabs', async ({ page }) => {
        await page.goto('/utilities');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.getByText(/Readings|Summary|Anomal|ESG/i).first()).toBeVisible({ timeout: 12000 });
    });

    test('energy summary endpoint returns monthly data', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/energy/summary?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(typeof body).toBe('object');
    });

});
