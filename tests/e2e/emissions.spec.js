// Copyright © 2026 Trier OS. All Rights Reserved.

const { test, expect } = require('@playwright/test');

test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

test.describe('Emissions & Carbon Intensity Tracking API', () => {

    test('GET /api/emissions/summary calculates scope 1 and 2', async ({ request }) => {
        const response = await request.get('/api/emissions/summary?plantId=Demo_Plant_1&startDate=2025-01-01&endDate=2026-12-31', {
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        expect(response.status()).toBe(200);
        
        const data = await response.json();
        expect(typeof data.scope1_kg).toBe('number');
        expect(typeof data.scope2_kg).toBe('number');
        expect(typeof data.total_kg).toBe('number');
        expect(data.plantId).toBe('Demo_Plant_1');
        expect(Array.isArray(data.scope1_sources)).toBeTruthy();
    });

    test('GET /api/emissions/intensity returns intensity calculations', async ({ request }) => {
        const response = await request.get('/api/emissions/intensity?plantId=Demo_Plant_1&startDate=2025-01-01&endDate=2026-12-31', {
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        expect(response.status()).toBe(200);
        
        const data = await response.json();
        expect(typeof data.total_kg).toBe('number');
        // If there's no production data, volume might be null, but that's handled cleanly.
    });

    test('PUT /api/emissions/config updates grid intensity', async ({ request }) => {
        const response = await request.put('/api/emissions/config', {
            headers: { 'x-plant-id': 'Demo_Plant_1' },
            data: { 
                plantId: 'Demo_Plant_1',
                gridIntensity: 0.386, 
                gridRegion: 'SERC' 
            }
        });
        expect(response.status()).toBe(200);
        
        const data = await response.json();
        expect(data.success).toBe(true);
    });

    test('GET /api/emissions/config returns configured values', async ({ request }) => {
        const response = await request.get('/api/emissions/config?plantId=Demo_Plant_1', {
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        expect(response.status()).toBe(200);
        
        const data = await response.json();
        expect(data.gridIntensity).toBe(0.386);
        expect(data.gridRegion).toBe('SERC');
        expect(data.plantId).toBe('Demo_Plant_1');
    });

    test('GET /api/emissions/report with format=csv returns CSV data', async ({ request }) => {
        const response = await request.get('/api/emissions/report?plantId=Demo_Plant_1&startDate=2025-01-01&endDate=2026-12-31&format=csv', {
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        expect(response.status()).toBe(200);
        
        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('text/csv');
        
        const text = await response.text();
        expect(text).toContain('period_start'); // Header row check
    });

});
