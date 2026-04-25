// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

const STORAGE_STATE = 'tests/e2e/.auth/ghost_admin.json';

test.describe('Spare Parts Inventory Optimization', () => {
    test.use({ storageState: STORAGE_STATE });

    test('API: /api/parts/optimization returns correct schema', async ({ request }) => {
        const res = await request.get('/api/parts/optimization?plantId=Demo_Plant_1', {
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        
        expect(res.ok()).toBeTruthy();
        
        const data = await res.json();
        expect(data).toHaveProperty('plantId');
        expect(data.plantId).toBe('Demo_Plant_1');
        expect(data).toHaveProperty('recommendations');
        expect(Array.isArray(data.recommendations)).toBeTruthy();

        if (data.recommendations.length > 0) {
            const first = data.recommendations[0];
            expect(first).toHaveProperty('partId');
            expect(first).toHaveProperty('description');
            expect(first).toHaveProperty('stock');
            expect(first).toHaveProperty('reorderPoint');
            expect(first).toHaveProperty('avgConsumptionRate');
            expect(first).toHaveProperty('suggestedOrderQty');
            expect(first).toHaveProperty('estimatedLeadTimeDays');
        }
    });

    test('UI: Storeroom renders Optimization tab and panel', async ({ page }) => {
        await page.goto('/storeroom');
        
        // Wait for Storeroom page to load
        await page.waitForSelector('text=Storeroom Intelligence', { timeout: 15000 }).catch(() => {});

        const optimizationTab = page.locator('button', { hasText: 'Optimization' });
        await expect(optimizationTab).toBeVisible();

        // Click Optimization tab
        await optimizationTab.click();

        // Verify the Optimization Panel is displayed (KPI card always renders)
        await expect(page.locator('text=REORDER RECOMMENDATIONS')).toBeVisible();
        // Table headers only render when there are recommendations; empty state shows a message instead
        const hasTable = await page.locator('th:has-text("Suggested Qty")').isVisible({ timeout: 5000 }).catch(() => false);
        const hasEmptyState = await page.locator('text=No items are currently below their reorder thresholds').isVisible({ timeout: 5000 }).catch(() => false);
        expect(hasTable || hasEmptyState).toBeTruthy();
    });
});
