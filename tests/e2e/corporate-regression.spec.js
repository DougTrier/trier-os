// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Real-application regressions for errors found in the complete browser log.
 * API dependencies: /api/search, /api/parts/optimization/corporate,
 * /api/assets and /api/scan/asset-status-batch. Isolated SQLite fixtures only.
 */
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const app = process.env.TRIER_REGRESSION_APP;
const token = 'CORPREG' + crypto.randomBytes(6).toString('hex');
const sites = ['Plant_1', 'Plant_2'];
const stores = [];
test.describe('Corporate query regressions (isolated application)', () => {
    test.skip(!app, 'Requires TRIER_REGRESSION_APP isolated regression sandbox.');
    test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });
    test.beforeAll(() => {
        const marker = JSON.parse(fs.readFileSync(path.join(app, '.regression-sandbox.json')));
        expect(path.resolve(marker.root, 'app')).toBe(path.resolve(app));
        for (const [index, site] of sites.entries()) {
            const db = new Database(path.join(app, 'data', site + '.db'), { fileMustExist: true });
            stores.push(db);
            db.prepare('INSERT INTO Asset(ID,Description) VALUES(?,?)').run(token, token + ' ' + site);
            db.prepare('INSERT INTO Work(ID,WorkOrderNumber,Description,AstID,StatusID) VALUES(?,?,?,?,?)').run(token, token + '-' + site, token + ' work ' + site, token, index ? 31 : 30);
        }
    });
    test.afterAll(() => {
        for (const db of stores) {
            db.prepare('DELETE FROM Work WHERE ID=?').run(token);
            db.prepare('DELETE FROM Asset WHERE ID=?').run(token);
            db.close();
        }
    });
    test('local search returns matching work and assets despite joined descriptions', async ({ request }) => {
        const response = await request.get('/api/search?q=' + token, { headers: { 'x-plant-id': sites[0] } });
        expect(response.status()).toBe(200);
        const { results } = await response.json();
        expect(results).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: token, type: 'asset', title: token + ' ' + sites[0] }),
            expect.objectContaining({ id: token + '-' + sites[0], type: 'work-order' }),
        ]));
    });
    test('corporate search cache cannot replace a later local result', async ({ request }) => {
        const corporate = await request.get('/api/search?q=' + token, { headers: { 'x-plant-id': 'all_sites' } });
        expect(corporate.status()).toBe(200);
        expect((await corporate.json()).results.some(row => row.plantId === sites[1])).toBe(true);
        const local = await request.get('/api/search?q=' + token, { headers: { 'x-plant-id': sites[0] } });
        expect(local.status()).toBe(200);
        const { results } = await local.json();
        expect(results.some(row => row.title?.includes(sites[1]) || row.plantId === sites[1])).toBe(false);
        expect(results.some(row => row.id === token && row.type === 'asset')).toBe(true);
    });
    test('corporate parts rollup includes registered production plants only', async ({ request }) => {
        const response = await request.get('/api/parts/optimization/corporate', { headers: { 'x-plant-id': 'all_sites' } });
        expect(response.status()).toBe(200);
        const { rollup } = await response.json();
        expect(rollup.map(row => row.plantId).sort()).toEqual(sites);
        expect(rollup.some(row => row.error)).toBe(false);
    });
    test('corporate asset badges use each asset site and keep duplicate IDs separate', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('selectedPlantId', 'all_sites'));
        const batches = [];
        page.on('response', response => {
            if (response.url().endsWith('/api/scan/asset-status-batch')) batches.push({ status: response.status(), site: response.request().headers()['x-plant-id'], fixture: response.request().postDataJSON().assetIds.includes(token) });
        });
        await page.goto('/assets');
        await page.getByPlaceholder('Search equipment by name, serial, model...').fill(token);
        const first = page.locator('tr').filter({ hasText: token + ' ' + sites[0] });
        const second = page.locator('tr').filter({ hasText: token + ' ' + sites[1] });
        await expect(first).toHaveCount(1);
        await expect(second).toHaveCount(1);
        await expect(first.locator('[title^="WO ' + token + '-Plant_1"]')).toContainText('In Progress');
        await expect(second.locator('[title^="WO ' + token + '-Plant_2"]')).toContainText('Waiting');
        expect(batches.some(batch => batch.site === 'all_sites' || batch.status !== 200)).toBe(false);
        expect(new Set(batches.filter(batch => batch.fixture).map(batch => batch.site))).toEqual(new Set(sites));
    });
});
