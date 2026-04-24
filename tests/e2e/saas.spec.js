// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

test.describe('SaaS Enablement API', () => {
    
    test('GET /api/saas/usage returns correct metrics schema', async ({ request }) => {
        const response = await request.get('/api/saas/usage?startDate=2025-01-01&endDate=2026-12-31');
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        expect(typeof body.metrics.api_calls.value).toBe('number');
        expect(typeof body.metrics.storage_mb.value).toBe('number');
        expect(typeof body.metrics.active_users.value).toBe('number');
        expect(typeof body.metrics.seat_count.value).toBe('number');
    });

    test('GET /api/saas/usage/breakdown returns plant array', async ({ request }) => {
        const response = await request.get('/api/saas/usage/breakdown?startDate=2025-01-01&endDate=2026-12-31');
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        expect(Array.isArray(body.plants)).toBe(true);
    });

    test('PUT /api/saas/instance-config updates configuration', async ({ request }) => {
        const response = await request.put('/api/saas/instance-config', {
            data: {
                instanceName: 'Acme OS',
                primaryColor: '#1a1a2e',
                poweredByVisible: false
            }
        });
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        expect(body.success).toBe(true);
    });

    test('GET /api/saas/instance-config returns updated configuration', async ({ request }) => {
        const response = await request.get('/api/saas/instance-config');
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        expect(body.instanceName).toBe('Acme OS');
        expect(body.primaryColor).toBe('#1a1a2e');
        expect(body.poweredByVisible).toBe(false);
    });

    test('GET /api/saas/billing-export with format=csv returns CSV data', async ({ request }) => {
        const response = await request.get('/api/saas/billing-export?startDate=2025-01-01&endDate=2026-12-31&format=csv');
        expect(response.status()).toBe(200);
        
        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('text/csv');
        
        const text = await response.text();
        expect(text).toContain('period_start');
        expect(text).toContain('api_calls');
        expect(text).toContain('storage_mb');
    });

});
