// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

const testPlantId = 'G8_Test_Plant';
let createdConfigId = null;

test.describe('Gatekeeper Adapter Config API (G8)', () => {

    test.beforeAll(async ({ request }) => {
        // Create a config to be used by tests 4, 6, 7, 10
        const response = await request.post('/api/gatekeeper/adapter-config', {
            data: {
                plantId: testPlantId,
                adapterType: 'SIMULATED'
            }
        });
        const body = await response.json();
        createdConfigId = body.id;
    });

    test.afterAll(async ({ request }) => {
        if (createdConfigId) {
            await request.delete(`/api/gatekeeper/adapter-config/${createdConfigId}`);
        }
    });

    test('1. POST /api/gatekeeper/adapter-config — create a SIMULATED config for Demo_Plant_1', async ({ request }) => {
        // We ensure Demo_Plant_1 doesn't have one, or we just ignore the 409 if it does.
        // Actually the test requires creating it.
        const response = await request.post('/api/gatekeeper/adapter-config', {
            data: {
                plantId: 'Demo_Plant_1',
                adapterType: 'SIMULATED'
            }
        });
        const body = await response.json();
        
        // If it already existed from a previous test run, we accept 409, otherwise 200
        if (response.status() === 200) {
            expect(body.ok).toBe(true);
            expect(typeof body.id).toBe('number');
            // Clean up the created one
            await request.delete(`/api/gatekeeper/adapter-config/${body.id}`);
        } else if (response.status() === 409) {
            expect(body.error).toBe('Adapter config already exists for this plant');
        } else {
            expect(response.status()).toBe(200); // Fail test if not 200 or 409
        }
    });

    test('2. POST with duplicate PlantID — same plant again → 409', async ({ request }) => {
        const response = await request.post('/api/gatekeeper/adapter-config', {
            data: {
                plantId: testPlantId,
                adapterType: 'SIMULATED'
            }
        });
        expect(response.status()).toBe(409);
        const body = await response.json();
        expect(body.error).toBe('Adapter config already exists for this plant');
    });

    test('3. GET /api/gatekeeper/adapter-config — returns array containing the created entry; Credentials field is masked if present', async ({ request }) => {
        const response = await request.get('/api/gatekeeper/adapter-config');
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(Array.isArray(body)).toBe(true);
        
        const found = body.find(c => c.PlantID === testPlantId);
        expect(found).toBeDefined();

        // Check that any record with Credentials has it masked
        for (const config of body) {
            if (config.Credentials) {
                expect(config.Credentials).toBe('••••');
            }
        }
    });

    test('4. GET /api/gatekeeper/adapter-config/:id — returns 200 with the specific record', async ({ request }) => {
        const response = await request.get(`/api/gatekeeper/adapter-config/${createdConfigId}`);
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.ConfigID).toBe(createdConfigId);
        expect(body.PlantID).toBe(testPlantId);
        expect(body.AdapterType).toBe('SIMULATED');
    });

    test('5. GET /api/gatekeeper/adapter-config/99999 — returns 404', async ({ request }) => {
        const response = await request.get('/api/gatekeeper/adapter-config/99999');
        expect(response.status()).toBe(404);
    });

    test('6. PUT /api/gatekeeper/adapter-config/:id — update Notes → { ok: true }; verify change persists with subsequent GET', async ({ request }) => {
        const putRes = await request.put(`/api/gatekeeper/adapter-config/${createdConfigId}`, {
            data: { Notes: 'Updated by E2E Test' }
        });
        expect(putRes.status()).toBe(200);
        const putBody = await putRes.json();
        expect(putBody.ok).toBe(true);

        const getRes = await request.get(`/api/gatekeeper/adapter-config/${createdConfigId}`);
        const getBody = await getRes.json();
        expect(getBody.Notes).toBe('Updated by E2E Test');
    });

    test('7. POST /api/gatekeeper/adapter-config/:id/test — test a SIMULATED config → 200 with success: true', async ({ request }) => {
        const response = await request.post(`/api/gatekeeper/adapter-config/${createdConfigId}/test`);
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.simulated).toBe(true);
    });

    test('8. POST with invalid adapterType — adapterType: \'TELEGRAM\' → 400', async ({ request }) => {
        const response = await request.post('/api/gatekeeper/adapter-config', {
            data: {
                plantId: 'Valid_Plant_Id',
                adapterType: 'TELEGRAM'
            }
        });
        expect(response.status()).toBe(400);
    });

    test('9. POST with invalid plantId — plantId: \'../../etc/passwd\' → 400 (S-1 validation)', async ({ request }) => {
        const response = await request.post('/api/gatekeeper/adapter-config', {
            data: {
                plantId: '../../etc/passwd',
                adapterType: 'SIMULATED'
            }
        });
        expect(response.status()).toBe(400);
    });

    test('10. DELETE /api/gatekeeper/adapter-config/:id → { ok: true }; confirm 404 on subsequent GET', async ({ request }) => {
        const delRes = await request.delete(`/api/gatekeeper/adapter-config/${createdConfigId}`);
        expect(delRes.status()).toBe(200);
        const delBody = await delRes.json();
        expect(delBody.ok).toBe(true);

        const getRes = await request.get(`/api/gatekeeper/adapter-config/${createdConfigId}`);
        expect(getRes.status()).toBe(404);

        // Nullify createdConfigId so afterAll doesn't fail trying to delete it again
        createdConfigId = null;
    });

});
