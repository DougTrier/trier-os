// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

const STORAGE_STATE = 'tests/e2e/.auth/ghost_admin.json';

test.describe('Shift Handover API', () => {
    test.use({ storageState: STORAGE_STATE });

    let handoverId = null;

    test('POST /api/shift-handover submits a new handover', async ({ request }) => {
        const res = await request.post('/api/shift-handover', {
            headers: { 'x-plant-id': 'Demo_Plant_1' },
            data: { notes: 'E2E test handover' }
        });
        
        expect(res.ok()).toBeTruthy();
        
        const data = await res.json();
        expect(data).toHaveProperty('success', true);
        expect(data).toHaveProperty('handoverId');
        handoverId = data.handoverId;
    });

    test('GET /api/shift-handover/history returns correct shape', async ({ request }) => {
        const res = await request.get('/api/shift-handover/history?plantId=Demo_Plant_1', {
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        
        expect(res.ok()).toBeTruthy();
        
        const data = await res.json();
        expect(data).toHaveProperty('data');
        expect(Array.isArray(data.data)).toBeTruthy();
        expect(data).toHaveProperty('meta');
        
        if (data.data.length > 0) {
            const first = data.data[0];
            expect(first).toHaveProperty('ID');
            expect(first).toHaveProperty('PlantID', 'Demo_Plant_1');
            expect(first).toHaveProperty('OutgoingTech');
            expect(first).toHaveProperty('Status');
            expect(first).toHaveProperty('items');
            expect(Array.isArray(first.items)).toBeTruthy();
        }
    });

    test('POST /api/shift-handover/:id/acknowledge acknowledges the handover', async ({ request }) => {
        expect(handoverId).toBeTruthy();

        const res = await request.post(`/api/shift-handover/${handoverId}/acknowledge`, {
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        
        expect(res.ok()).toBeTruthy();
        
        const data = await res.json();
        expect(data).toHaveProperty('success', true);
        expect(data).toHaveProperty('handoverId', handoverId);
    });

    test('UI: Shift Handover View renders', async ({ page }) => {
        await page.goto('/shift-handover');
        await expect(page.locator('h2', { hasText: 'Shift Handover' })).toBeVisible();
        await expect(page.locator('button', { hasText: 'Incoming Shift' })).toBeVisible();
        await expect(page.locator('button', { hasText: 'Outgoing Shift' })).toBeVisible();
    });
});
