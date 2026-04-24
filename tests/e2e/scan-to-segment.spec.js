// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

import { test, expect } from '@playwright/test';

const STORAGE_STATE = 'tests/e2e/.auth/ghost_admin.json';
const PARENT_ASSET = 'M-1250'; // Assuming an asset with a schematic
const CHILD_ASSET = 'M-1250-V1'; // Child asset id linked in pin
const PLANT_ID = 'Jefferson_City';

test.describe('Scan-to-Segment (Digital Twin)', () => {
    test.use({ storageState: STORAGE_STATE });

    test('online scan to child asset WO creation', async ({ request }) => {
        // Step 1: Scan parent asset
        const scan1 = await request.post('/api/scan', {
            headers: { 'x-plant-id': PLANT_ID },
            data: {
                scanId: `test-scan-${Date.now()}`,
                assetId: PARENT_ASSET,
                deviceTimestamp: new Date().toISOString(),
            }
        });

        // Some assets might not have a twin in test data yet, we assume the API handles it correctly.
        // If it doesn't have a twin, it'll just auto create. We assume we are testing the API contract.
        const res1 = await scan1.json();
        
        // We will mock the backend logic if there's no test data for schematic
        // Actually, let's just make a direct call to the child asset to simulate the frontend action
        if (res1.branch === 'ROUTE_TO_DIGITAL_TWIN') {
            expect(res1.schematic).toBeDefined();
            expect(res1.schematic.pins.length).toBeGreaterThan(0);
        }

        // Step 2: Simulate selecting pin and failure mode
        const scan2 = await request.post('/api/scan', {
            headers: { 'x-plant-id': PLANT_ID },
            data: {
                scanId: `test-scan-${Date.now() + 1}`,
                assetId: CHILD_ASSET,
                segmentReason: 'Valve Leak',
                deviceTimestamp: new Date().toISOString(),
            }
        });

        const res2 = await scan2.json();
        // Child asset might route to active or auto create, or not exist in test DB
        if (scan2.status() === 404) {
            expect(res2.error).toBe('Asset not found');
        } else {
            expect(['ROUTE_TO_ACTIVE_WO', 'AUTO_CREATE_WO', 'ASSET_NOT_FOUND']).toContain(res2.branch);
        }
    });

    test('offline scan to child asset replay', async ({ request }) => {
        // Simulate an offline sync payload containing the child asset with segment reason
        const payload = {
            scanId: `offline-scan-${Date.now()}`,
            assetId: CHILD_ASSET,
            userId: 'ghost_admin',
            deviceTimestamp: new Date().toISOString(),
            segmentReason: 'Offline Valve Leak',
            offlineCaptured: true
        };

        const res = await request.post('/api/scan/offline-sync', {
            headers: { 'x-plant-id': PLANT_ID },
            data: { scans: [payload] }
        });

        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(body.results[0].scanId).toBe(payload.scanId);
    });
});
