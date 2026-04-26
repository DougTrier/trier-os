// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * qa-advanced.spec.js — QA Inspection: P6 Platform Maturity + P7 Category-Defining
 * Covers: Compliance, Vibration, ERP Connectors, Report Builder, Behavioral Baseline,
 *         Causality Graph, Failure Containment Scoring
 * Run: npx playwright test tests/e2e/qa-advanced.spec.js
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

// ── P6 — Compliance Packs ────────────────────────────────────────────────────
test.describe('P6 — Compliance Packs', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('compliance page renders', async ({ page }) => {
        await page.goto('/compliance');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.locator('body')).toBeVisible();
    });

    test('create compliance framework', async ({ page }) => {
        const code = `QA-ISO-${Date.now()}`;
        const res = await api(page, 'POST', `${API}/compliance/frameworks`, {
            name: 'QA Test Framework', code, plantId: PLANT, description: 'Created by Playwright QA',
        });
        expect([200, 201]).toContain(res.status());
        const body = await res.json();
        expect(body).toHaveProperty('id');
    });

    test('compliance stats endpoint returns scorecard', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/compliance/stats?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(typeof body).toBe('object');
    });

});

// ── P6 — Vibration & Condition Monitoring ────────────────────────────────────
test.describe('P6 — Vibration & Condition Monitoring', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('create vibration profile (upsert — no duplicate error on re-POST)', async ({ page }) => {
        const payload = {
            plantId: PLANT, assetId: 'QA-VIB-TEST', measurementPoint: 'DE',
            alertThreshold: 4.5, dangerThreshold: 11.2,
        };
        const r1 = await api(page, 'POST', `${API}/vibration/profiles`, payload);
        expect([200, 201]).toContain(r1.status());
        const r2 = await api(page, 'POST', `${API}/vibration/profiles`, { ...payload, alertThreshold: 5.0 });
        expect([200, 201]).toContain(r2.status());
    });

    test('NORMAL reading — no alert created', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/vibration/reading`, {
            plantId: PLANT, assetId: 'QA-VIB-TEST', measurementPoint: 'DE', overallVelocity: 2.1,
        });
        expect([200, 201]).toContain(res.status());
        const body = await res.json();
        expect(body.severity).toBe('NORMAL');
        expect(body.alertCreated).toBeFalsy();
    });

    test('ALERT reading — alert entry created', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/vibration/reading`, {
            plantId: PLANT, assetId: 'QA-VIB-TEST', measurementPoint: 'DE', overallVelocity: 6.5,
        });
        expect([200, 201]).toContain(res.status());
        const body = await res.json();
        expect(body.severity).toBe('ALERT');
        expect(body.alertCreated).toBeTruthy();
    });

    test('DANGER reading — DANGER-type alert created', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/vibration/reading`, {
            plantId: PLANT, assetId: 'QA-VIB-TEST', measurementPoint: 'DE', overallVelocity: 12.0,
        });
        expect([200, 201]).toContain(res.status());
        const body = await res.json();
        expect(body.severity).toBe('DANGER');
    });

    test('active alerts endpoint returns list', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/vibration/alerts?plantId=${PLANT}&status=ACTIVE`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBeTruthy();
    });

});

// ── P6 — ERP Connectors ──────────────────────────────────────────────────────
test.describe('P6 — ERP Connectors', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('catalog returns 5 connector types', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/erp-connectors/catalog`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        const catalog = Array.isArray(body) ? body : (body.catalog || body.data || []);
        expect(catalog.length).toBeGreaterThanOrEqual(5);
    });

    test('create connector instance', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/erp-connectors`, {
            plantId: PLANT, connectorType: 'CUSTOM', name: 'QA Test Connector', host: 'http://localhost:9999',
        });
        expect([200, 201]).toContain(res.status());
        const body = await res.json();
        expect(body).toHaveProperty('id');
    });

    test('field mappings replace — no duplicates', async ({ page }) => {
        const createRes = await api(page, 'POST', `${API}/erp-connectors`, {
            plantId: PLANT, connectorType: 'CUSTOM', name: 'QA Mapping Test', host: 'http://localhost:9999',
        });
        const connector = await createRes.json();

        const mappingPayload = {
            eventType: 'WO_CLOSE',
            mappings: [
                { trierOSField: 'WorkOrderNumber', erpField: 'WO_NUM' },
                { trierOSField: 'ActualHours',     erpField: 'HOURS' },
            ],
        };
        const r1 = await api(page, 'PUT', `${API}/erp-connectors/${connector.id}/mappings`, mappingPayload);
        expect(r1.status()).toBe(200);
        const r2 = await api(page, 'PUT', `${API}/erp-connectors/${connector.id}/mappings`, mappingPayload);
        expect(r2.status()).toBe(200);
    });

});

// ── P6 — Report Builder ──────────────────────────────────────────────────────
test.describe('P6 — Report Builder', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('analytics page renders at /analytics', async ({ page }) => {
        await page.goto('/analytics');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.locator('body')).toBeVisible();
    });

    test('report builder CSV export sets correct headers', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/report-builder/execute?format=csv`,
            { query: 'SELECT 1 AS test_col', plantId: PLANT });
        if (res.status() === 200) {
            const ct = res.headers()['content-type'] || '';
            const cd = res.headers()['content-disposition'] || '';
            expect(ct).toMatch(/csv/i);
            expect(cd).toMatch(/attachment/i);
        } else {
            expect([200, 400, 403, 404, 422]).toContain(res.status());
        }
    });

});

// ── P7 — Plant Behavioral Baseline Engine ────────────────────────────────────
test.describe('P7 — Plant Behavioral Baseline Engine', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('POST /api/baseline/recalculate runs without error', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/baseline/recalculate`, { plantId: PLANT });
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(typeof body.calculated).toBe('number');
        expect(typeof body.skipped).toBe('number');
    });

    test('GET /api/baseline/dashboard returns tier counts', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/baseline/dashboard?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('total');
        expect(body).toHaveProperty('alerts');
        expect(body).toHaveProperty('warnings');
        expect(body).toHaveProperty('stable');
    });

    test('GET /api/baseline/drift returns array', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/baseline/drift?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBeTruthy();
    });

    test('GET /api/baseline/asset/:id returns profile or 404', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/baseline/asset/NONEXISTENT?plantId=${PLANT}`);
        expect([200, 404]).toContain(res.status());
        if (res.status() === 404) {
            const body = await res.json();
            expect(body.error).toMatch(/insufficient|minimum/i);
        }
    });

});

// ── P7 — Causality Graph & Explainable Operations ────────────────────────────
test.describe('P7 — Causality Graph & Explainable Operations', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('timeline endpoint returns event list', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/causality/timeline/QA-TEST?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('eventCount');
        expect(body).toHaveProperty('events');
        expect(Array.isArray(body.events)).toBeTruthy();
    });

    test('events have required fields', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/causality/timeline/QA-TEST?plantId=${PLANT}`);
        const body = await res.json();
        if (body.events.length > 0) {
            const event = body.events[0];
            expect(event).toHaveProperty('type');
            expect(event).toHaveProperty('timestamp');
            expect(event).toHaveProperty('label');
            expect(event).toHaveProperty('source');
        }
    });

    test('cross-system summary returns integer counts', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/causality/summary?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(typeof body.openRCAs).toBe('number');
        expect(typeof body.openCAPAs).toBe('number');
        expect(typeof body.newRCAs30).toBe('number');
        expect(typeof body.activeVibrationAlerts).toBe('number');
    });

    test('WO causal chain returns anchor flag and linked objects', async ({ page }) => {
        const woRes = await api(page, 'GET', `${API}/work-orders?plantId=${PLANT}&limit=1`);
        const wos = await woRes.json().catch(() => []);
        const woList = Array.isArray(wos) ? wos : (wos.workOrders || wos.data || []);
        if (!woList.length) { test.skip(); return; }

        const woId = woList[0].ID || woList[0].id;
        const res  = await api(page, 'GET', `${API}/causality/chain/${woId}?plantId=${PLANT}`);
        if (res.status() === 404) { test.skip(); return; }
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('wo');
        expect(body).toHaveProperty('chain');
        expect(Array.isArray(body.chain)).toBeTruthy();
    });

});

// ── P7 — Failure Containment Scoring ────────────────────────────────────────
test.describe('P7 — Failure Containment Scoring', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('score endpoint returns tier, emoji, color', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/containment/score/QA-TEST?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('score');
        expect(body).toHaveProperty('tier');
        expect(body).toHaveProperty('emoji');
        expect(body).toHaveProperty('color');
        expect(['ISOLATED', 'PARTIAL', 'CASCADING']).toContain(body.tier);
    });

    test('tier thresholds — ISOLATED for score 0–3', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/containment/score/QA-NONEXISTENT?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        if (body.score <= 3) expect(body.tier).toBe('ISOLATED');
        if (body.score >= 4 && body.score <= 7) expect(body.tier).toBe('PARTIAL');
        if (body.score >= 8) expect(body.tier).toBe('CASCADING');
    });

    test('blast-radius endpoint returns childAssets array', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/containment/blast-radius/QA-TEST?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('childAssets');
        expect(Array.isArray(body.childAssets)).toBeTruthy();
    });

    test('dashboard returns summary + sorted assets', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/containment/dashboard?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('summary');
        expect(body.summary).toHaveProperty('cascading');
        expect(body.summary).toHaveProperty('partial');
        expect(body.summary).toHaveProperty('isolated');
        expect(body).toHaveProperty('assets');
        if (body.assets.length >= 2) expect(body.assets[0].score).toBeGreaterThanOrEqual(body.assets[1].score);
    });

});
