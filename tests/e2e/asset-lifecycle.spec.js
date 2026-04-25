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
        // Navigate home first so the app fully initializes with the auth storage state
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        // Set Plant_1 so AssetLifecycleCard API calls hit a real writable DB
        await page.evaluate(() => localStorage.setItem('selectedPlantId', 'Plant_1'));
        // Navigate directly to the assets route
        await page.goto('/assets');

        // Wait for the asset table to load — AssetsView list mode renders a data-table with View buttons
        // Mobile Chrome (360px) renders the same table but may take longer to hydrate
        await page.waitForSelector('table.data-table tbody tr', { state: 'visible', timeout: 40000 });

        // Click the View button on the first asset row to open the detail panel
        const firstViewBtn = page.locator('table.data-table tbody tr .btn-view-standard').first();
        await firstViewBtn.waitFor({ state: 'visible', timeout: 10000 });
        await firstViewBtn.click();

        // Wait for the asset detail modal to open (AssetsView uses .modal-content-standard)
        const modal = page.locator('.modal-content-standard').first();
        await expect(modal).toBeVisible({ timeout: 10000 });

        // Check for the lifecycle card presence.
        // The card renders "Asset Lifecycle is Healthy" or "Repair / Replace Ratio"
        await expect(
            page.locator('text=Asset Lifecycle is Healthy').or(page.locator('text=Repair / Replace Ratio'))
        ).toBeVisible({ timeout: 15000 });
    });
});
