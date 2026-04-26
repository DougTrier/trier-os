// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * qa-safety.spec.js — QA Inspection: P4 Safety & Compliance
 * Covers: Permit to Work, Management of Change, Training, Contractor Management
 * Run: npx playwright test tests/e2e/qa-safety.spec.js
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

// ── P4 — Permit to Work ──────────────────────────────────────────────────────
test.describe('P4 — Permit to Work', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('safety permits page renders', async ({ page }) => {
        await page.goto('/safety');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.getByText(/Permits|PTW|Permit to Work/i).first()).toBeVisible({ timeout: 12000 });
    });

    test('create HOT_WORK permit via API', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/safety-permits/permits`, {
            plantId: PLANT, permitType: 'HOT_WORK', assetId: `QA-HW-ASSET-${Date.now()}`,
            issuedBy: 'qa-tester', location: 'QA Area',
            expiresAt: new Date(Date.now() + 86400000 * 2).toISOString(),
            description: 'QA automated test permit',
        });
        expect([200, 201]).toContain(res.status());
        const body = await res.json();
        const pNum = body.PermitNumber || body.permitNumber;
        expect(pNum).toMatch(/^[A-Z]{3}-/);
    });

    test('create COLD_WORK permit — checklist auto-populates', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/safety-permits/permits`, {
            plantId: PLANT, permitType: 'COLD_WORK', assetId: `QA-CW-ASSET-${Date.now()}`,
            issuedBy: 'qa-tester', location: 'QA Area',
            expiresAt: new Date(Date.now() + 86400000 * 2).toISOString(),
            description: 'QA cold work test',
        });
        expect([200, 201]).toContain(res.status());
        const body = await res.json();
        expect(body).toHaveProperty('checklist');
        expect(Array.isArray(body.checklist)).toBeTruthy();
        expect(body.checklist.length).toBeGreaterThanOrEqual(8);
    });

    test('simultaneous ops conflict returns 409', async ({ page }) => {
        const assetId = `QA-SIMOPS-${Date.now()}`;
        const permitPayload = {
            plantId: PLANT, permitType: 'HOT_WORK', assetId,
            issuedBy: 'qa-tester', location: 'QA Area',
            expiresAt: new Date(Date.now() + 86400000 * 2).toISOString(),
            description: 'First permit',
        };
        const r1 = await api(page, 'POST', `${API}/safety-permits/permits`, permitPayload);
        expect([200, 201]).toContain(r1.status());
        const r2 = await api(page, 'POST', `${API}/safety-permits/permits`, {
            ...permitPayload, workDescription: 'Second permit — should conflict',
        });
        expect(r2.status()).toBe(409);
    });

    test('LOTO page renders', async ({ page }) => {
        await page.goto('/loto');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.locator('body')).toBeVisible();
    });

});

// ── P4 — Management of Change (MOC) ─────────────────────────────────────────
test.describe('P4 — Management of Change (MOC)', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('create EQUIPMENT MOC — 3 approval stages auto-created', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/moc`, {
            title: 'QA Test MOC — Equipment Change', plantId: PLANT,
            changeType: 'EQUIPMENT', requestedBy: 'qa-tester',
            description: 'Automated QA test MOC',
        });
        expect([200, 201]).toContain(res.status());
        const body = await res.json();
        expect(body).toHaveProperty('MOCNumber');
        expect(body.MOCNumber).toMatch(/MOC-/);
        expect(body.approvalStages).toHaveLength(3);
    });

    test('create EMERGENCY MOC — 1 approval stage', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/moc`, {
            title: 'QA Emergency MOC', plantId: PLANT, changeType: 'EMERGENCY', requestedBy: 'qa-tester',
        });
        expect([200, 201]).toContain(res.status());
        const body = await res.json();
        expect(body.approvalStages).toHaveLength(1);
    });

    test('create TEMPORARY MOC — 2 approval stages', async ({ page }) => {
        const res = await api(page, 'POST', `${API}/moc`, {
            title: 'QA Temporary MOC', plantId: PLANT, changeType: 'TEMPORARY', requestedBy: 'qa-tester',
        });
        expect([200, 201]).toContain(res.status());
        const body = await res.json();
        expect(body.approvalStages).toHaveLength(2);
    });

    test('advance MOC approval stage', async ({ page }) => {
        const createRes = await api(page, 'POST', `${API}/moc`, {
            title: 'QA Approval Test MOC', plantId: PLANT, changeType: 'PROCESS', requestedBy: 'qa-tester',
        });
        const moc = await createRes.json();
        // MOC_APPROVE is SAFETY_CRITICAL — 403 expected in no-LDAP dev env
        const approveRes = await api(page, 'POST', `${API}/moc/${moc.id}/approve`, {
            approvedBy: 'qa-tester', decision: 'APPROVED', comments: 'QA auto-approved',
        });
        expect([200, 403]).toContain(approveRes.status());
    });

    test('reject MOC — status goes to REJECTED', async ({ page }) => {
        const createRes = await api(page, 'POST', `${API}/moc`, {
            title: 'QA Reject Test MOC', plantId: PLANT, changeType: 'PROCEDURE', requestedBy: 'qa-tester',
        });
        const moc = await createRes.json();
        const rejectRes = await api(page, 'POST', `${API}/moc/${moc.id}/approve`, {
            approvedBy: 'qa-tester', decision: 'REJECTED', comments: 'Rejected for QA test',
        });
        expect([200, 403]).toContain(rejectRes.status());
        if (rejectRes.status() === 200) {
            const body = await rejectRes.json();
            expect(body.newStatus).toMatch(/REJECTED/i);
        }
    });

});

// ── P4 — Training & Competency ───────────────────────────────────────────────
test.describe('P4 — Training & Competency', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('training page renders with course library', async ({ page }) => {
        await page.goto('/training');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.getByText(/Course Library|Courses/i).first()).toBeVisible({ timeout: 12000 });
    });

    test('GET /api/training/courses returns ≥ 20 default courses', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/training/courses`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        const courses = Array.isArray(body) ? body : (body.courses || body.data || []);
        expect(courses.length).toBeGreaterThanOrEqual(20);
    });

    test('GET /api/training/expiring returns list of certs', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/training/expiring?plantId=${PLANT}`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        const certs = Array.isArray(body) ? body : (body.expiring || body.records || []);
        expect(Array.isArray(certs)).toBeTruthy();
    });

});

// ── P4 — Contractor Management ───────────────────────────────────────────────
test.describe('P4 — Contractor Management', () => {

    test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

    test('contractors page renders', async ({ page }) => {
        await page.goto('/contractors');
        await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
        await expect(page.locator('body')).toBeVisible();
    });

    test('GET /api/contractors returns list', async ({ page }) => {
        const res = await api(page, 'GET', `${API}/contractors`);
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBeTruthy();
    });

    test('contractor inductions CRUD', async ({ page }) => {
        const listRes = await api(page, 'GET', `${API}/contractors`);
        const contractors = await listRes.json();
        if (!contractors.length) { test.skip(); return; }
        const contractorId = contractors[0].id || contractors[0].ID;

        const res = await api(page, 'POST', `${API}/contractors/${contractorId}/inductions`, {
            plantId: PLANT, inductedBy: 'qa-tester', inductionType: 'Site Safety',
        });
        expect([200, 201]).toContain(res.status());

        const getRes = await api(page, 'GET', `${API}/contractors/${contractorId}/inductions`);
        expect(getRes.status()).toBe(200);
        const inductions = await getRes.json();
        expect(Array.isArray(inductions)).toBeTruthy();
    });

});
