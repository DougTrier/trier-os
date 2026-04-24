// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

test.describe('Distributed Edge Execution Mesh (P7-4-impl)', () => {
    test('1. GET /api/edge-mesh/artifacts - assert 200, body.artifacts is an array', async ({ request }) => {
        const res = await request.get('/api/edge-mesh/artifacts');
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(Array.isArray(body.artifacts)).toBe(true);
    });

    test('2. GET /api/edge-mesh/sync-status - assert 200, response is an array', async ({ request }) => {
        const res = await request.get('/api/edge-mesh/sync-status');
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
    });

    test('3. GET /api/edge-mesh/pull-manifest without Authorization header - assert 401 or 503', async ({ request }) => {
        const res = await request.get('/api/edge-mesh/pull-manifest?plantId=Demo_Plant_1', {
            // override the default request that includes cookies/auth
            headers: { 'Authorization': '' }
        });
        expect([401, 503]).toContain(res.status());
    });

    test('4. GET /api/edge-mesh/pull-manifest with valid Authorization header - assert 200', async ({ request }) => {
        const token = process.env.EDGE_MESH_TOKEN;
        if (!token) {
            test.skip();
            return;
        }

        const res = await request.get('/api/edge-mesh/pull-manifest?plantId=Demo_Plant_1', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(Array.isArray(body.artifacts)).toBe(true);
    });

    test('5. POST /api/edge-mesh/artifacts with escaping filePath - assert 400', async ({ request }) => {
        const res = await request.post('/api/edge-mesh/artifacts', {
            data: {
                name: 'Bad Artifact',
                type: 'SOP_PDF',
                plantId: 'Demo_Plant_1',
                filePath: '../../server/index.js'
            }
        });
        
        expect(res.status()).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('within the artifacts directory');
    });
});
