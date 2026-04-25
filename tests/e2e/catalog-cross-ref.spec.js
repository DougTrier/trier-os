// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

const STORAGE_STATE = 'tests/e2e/.auth/ghost_admin.json';

test.describe('Cross-Catalog Reference Engine API', () => {
    test.use({ storageState: STORAGE_STATE });

    // Unique per-run OEM part number so tests 4+5 work idempotently across multiple runs
    const oemPartNumber = `TEST-OEM-${Date.now()}`;

    test('1. GET /api/catalog/search?q=bearing returns parts and equipment', async ({ request }) => {
        const response = await request.get('/api/catalog/search?q=bearing');
        expect(response.ok()).toBeTruthy();
        
        const body = await response.json();
        expect(Array.isArray(body.parts)).toBeTruthy();
        expect(Array.isArray(body.equipment)).toBeTruthy();
        expect(body.parts.length).toBeGreaterThan(0);
    });

    test('2. GET /api/catalog/search?q=bearing&verticals=WWT returns only WWT prefix parts', async ({ request }) => {
        const response = await request.get('/api/catalog/search?q=bearing&verticals=WWT');
        expect(response.ok()).toBeTruthy();
        
        const body = await response.json();
        for (const part of body.parts) {
            expect(part.MasterPartID.startsWith('WWT-')).toBeTruthy();
        }
    });

    test('3. GET /api/catalog/search (no q) returns 400', async ({ request }) => {
        const response = await request.get('/api/catalog/search');
        expect(response.status()).toBe(400);
    });

    test('4. POST /api/catalog/cross-ref succeeds for valid OEM', async ({ request }) => {
        const response = await request.post('/api/catalog/cross-ref', {
            data: {
                type: 'OEM',
                masterPartId: 'MFG-BRG-WRIST-100',
                oemManufacturer: 'FANUC',
                oemPartNumber
            }
        });
        expect(response.status()).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);
    });

    test('5. POST /api/catalog/cross-ref fails on duplicate OEM', async ({ request }) => {
        const response = await request.post('/api/catalog/cross-ref', {
            data: {
                type: 'OEM',
                masterPartId: 'MFG-BRG-WRIST-100',
                oemManufacturer: 'FANUC',
                oemPartNumber
            }
        });
        expect(response.status()).toBe(409);
        const body = await response.json();
        expect(body.error).toContain('already exists');
    });
});
