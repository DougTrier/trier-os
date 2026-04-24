// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

test.describe('Digital Twin External Platform Integration API', () => {

    test('POST /api/dt-sync/config saves configuration', async ({ request }) => {
        const response = await request.post('/api/dt-sync/config', {
            data: {
                plantId: 'Demo_Plant_1',
                platform: 'BENTLEY_ITWIN',
                instanceURL: 'https://api.bentley.com',
                syncDirection: 'OUTBOUND',
                clientSecret: 'secret123'
            }
        });
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        expect(body.success).toBe(true);
    });

    test('GET /api/dt-sync/config returns masked credentials', async ({ request }) => {
        const response = await request.get('/api/dt-sync/config?plantId=Demo_Plant_1');
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeGreaterThan(0);
        expect(body[0].Platform).toBe('BENTLEY_ITWIN');
        expect(body[0].ClientSecret).toBe('***');
    });

    test('POST /api/dt-sync/test-connection blocks SSRF (private range)', async ({ request }) => {
        const response = await request.post('/api/dt-sync/test-connection', {
            data: {
                instanceURL: 'http://192.168.1.1/admin'
            }
        });
        expect(response.status()).toBe(400);
        
        const body = await response.json();
        expect(body.error).toContain('Private/loopback address blocked');
    });

    test('POST /api/dt-sync/Demo_Plant_1/push simulates outbound sync', async ({ request }) => {
        const response = await request.post('/api/dt-sync/Demo_Plant_1/push');
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        expect(body.status).toBe('COMPLETE');
        expect(typeof body.assetCount).toBe('number');
    });

    test('GET /api/dt-sync/Demo_Plant_1/status returns latest sync status', async ({ request }) => {
        const response = await request.get('/api/dt-sync/Demo_Plant_1/status');
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        expect(body.Status).toBeDefined();
        expect(body.PlantID).toBe('Demo_Plant_1');
    });

});
