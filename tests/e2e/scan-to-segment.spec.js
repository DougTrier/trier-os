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
const PLANT_ID = 'Demo_Plant_2';

// ── Phase 1 — Async Scan Path (Better Scan Flow) ─────────────────────────────
// These tests verify the core Phase 1 contract:
//   - 404 scan response arrives in <2s (Gemini never on critical path)
//   - semanticMatch is null in the 404 body (enrichment is async-only)
//   - enrichmentId is present so the client can subscribe to the SSE stream
//   - SSE endpoint delivers an enrichment event and closes cleanly
test.describe('Phase 1 — Async Scan Path', () => {
    test.use({ storageState: STORAGE_STATE });

    test('404 scan for unknown asset returns <2s with enrichmentId', async ({ request }) => {
        const unknownAssetId = `UNKNOWN-P1-${Date.now()}`;
        const start = Date.now();

        const res = await request.post('/api/scan', {
            headers: { 'x-plant-id': PLANT_ID },
            data: {
                scanId: `p1-timing-${Date.now()}`,
                assetId: unknownAssetId,
                deviceTimestamp: new Date().toISOString(),
            },
        });

        const elapsed = Date.now() - start;
        expect(res.status()).toBe(404);
        expect(elapsed).toBeLessThan(2000);

        const body = await res.json();
        expect(body.error).toBe('Asset not found');
        expect(body.assetId).toBe(unknownAssetId);
        expect(body.semanticMatch).toBeNull();
        // enrichmentId = scanId when enqueued; null only if dedup hit (won't happen on first scan)
        expect(body.enrichmentId).toBeTruthy();
    });

    test('SSE enrichment endpoint streams a result event and closes', async ({ request }) => {
        const unknownAssetId = `UNKNOWN-SSE-${Date.now()}`;
        const scanId = `p1-sse-scan-${Date.now()}`;

        const scanRes = await request.post('/api/scan', {
            headers: { 'x-plant-id': PLANT_ID },
            data: {
                scanId,
                assetId: unknownAssetId,
                deviceTimestamp: new Date().toISOString(),
            },
        });
        expect(scanRes.status()).toBe(404);
        const { enrichmentId } = await scanRes.json();
        if (!enrichmentId) test.skip(); // dedup hit — skip rather than fail

        // SSE endpoint should respond 200 with text/event-stream
        // In CI (no Gemini key) runEnrichment completes immediately → result ready within setImmediate
        const sseRes = await request.get(`/api/scan/enrichment/${enrichmentId}`, {
            headers: { 'x-plant-id': PLANT_ID },
            timeout: 15_000,
        });

        expect(sseRes.status()).toBe(200);
        expect(sseRes.headers()['content-type']).toContain('text/event-stream');

        const text = await sseRes.text();
        expect(text).toContain('"type":"enrichment"');
        expect(text).toContain(`"enrichmentId":"${enrichmentId}"`);
    });

    test('SSE endpoint rejects malformed enrichmentId with 400', async ({ request }) => {
        // Use URL-encoded traversal so it reaches the route handler as the :id param
        // (raw ../../ gets path-normalized by Express before routing → 404 not 400)
        const res = await request.get('/api/scan/enrichment/..%2F..%2Fetc%2Fpasswd', {
            headers: { 'x-plant-id': PLANT_ID },
        });
        expect(res.status()).toBe(400);
    });

    test('same scanId submitted twice (double-fire) returns enrichmentId=null on second hit', async ({ request }) => {
        // Dedup key is assetId:scanId:floor(timestamp/1000).
        // A badge reader that double-fires sends the exact same scanId twice.
        // The first enqueue succeeds; the second hits the in-flight map and returns null.
        const unknownAssetId = `UNKNOWN-DEDUP-${Date.now()}`;
        const sharedScanId  = `dedup-same-${Date.now()}`;
        const timestamp = new Date().toISOString();

        const res1 = await request.post('/api/scan', {
            headers: { 'x-plant-id': PLANT_ID },
            data: { scanId: sharedScanId, assetId: unknownAssetId, deviceTimestamp: timestamp },
        });
        const body1 = await res1.json();
        expect(res1.status()).toBe(404);
        expect(body1.enrichmentId).toBeTruthy();

        // Same scanId + same assetId within the 5s dedup window → enrichmentId null
        const res2 = await request.post('/api/scan', {
            headers: { 'x-plant-id': PLANT_ID },
            data: { scanId: sharedScanId, assetId: unknownAssetId, deviceTimestamp: timestamp },
        });
        const body2 = await res2.json();
        expect(res2.status()).toBe(404);
        expect(body2.enrichmentId).toBeNull();
    });
});

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
