// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

const STORAGE_STATE = 'tests/e2e/.auth/ghost_admin.json';

test.describe('Asset Lifecycle & Capital Planning', () => {
    test.use({ storageState: STORAGE_STATE });

    test('GET /api/asset-lifecycle/recommendations returns expected shape', async ({ request }) => {
        const response = await request.get('/api/asset-lifecycle/recommendations', {
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        
        expect(data).toHaveProperty('recommendations');
        expect(Array.isArray(data.recommendations)).toBeTruthy();
        
        expect(data).toHaveProperty('summary');
        expect(data.summary).toHaveProperty('totalEvaluated');
        expect(data.summary).toHaveProperty('totalRecommendations');
        expect(data.summary).toHaveProperty('criticalReplacements');
        expect(data.summary).toHaveProperty('totalLiability');
    });

    test('GET /api/asset-lifecycle/forecast returns expected shape', async ({ request }) => {
        const response = await request.get('/api/asset-lifecycle/forecast', {
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        
        expect(data).toHaveProperty('forecast');
        expect(data.forecast).toHaveProperty('year1');
        expect(data.forecast).toHaveProperty('year3');
        expect(data.forecast).toHaveProperty('year5');
        expect(data.forecast).toHaveProperty('beyond');
        
        expect(data.forecast.year1).toHaveProperty('count');
        expect(data.forecast.year1).toHaveProperty('cost');
    });

    // 2. UI Test for Asset Detail view card presence
    test('Asset detail view renders the lifecycle card', async ({ page }) => {
        // Navigate to the Engineering / Assets & BOMs tile directly
        await page.goto('/#/?workspace=assets');
        
        // Wait for assets to load
        await page.waitForSelector('.grid-row', { state: 'visible', timeout: 15000 });
        
        // Click the first asset in the list
        const firstAssetRow = page.locator('.grid-row').first();
        await firstAssetRow.click();
        
        // Wait for the asset modal/detail panel to open
        const modal = page.locator('.modal-content, .drawer-content, .asset-detail-panel');
        await expect(modal).toBeVisible({ timeout: 10000 });
        
        // Check for the lifecycle card presence.
        // The card renders "Asset Lifecycle is Healthy" or "Repair / Replace Ratio"
        // Let's use a text matcher that covers the possible renders or look for the bounding container.
        await expect(page.locator('text=Asset Lifecycle is Healthy').or(page.locator('text=Repair / Replace Ratio'))).toBeVisible({ timeout: 10000 });
    });
});
