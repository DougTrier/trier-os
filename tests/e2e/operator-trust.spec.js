// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

test.describe('Operator Trust Layer (P7-3-impl)', () => {
    let globalRecId = null;

    test('1. POST /api/operator-trust/recommendations - log PREDICTIVE_FORECAST', async ({ request }) => {
        const payload = {
            type: 'PREDICTIVE_FORECAST',
            plantId: 'Demo_Plant_1',
            assetId: 'TEST-AST-01',
            recommendedAction: 'Asset TEST-AST-01 predicted to fail within 14 days',
            confidenceScore: 0.82,
            confidenceBand: 'HIGH',
            emittedPayload: { mtbfDays: 120, predictedFailureDate: '2026-05-01' }
        };

        const res = await request.post('/api/operator-trust/recommendations', {
            data: payload
        });
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(typeof body.recommendationId).toBe('number');
        globalRecId = body.recommendationId;
    });

    test('2. GET /api/operator-trust/recommendations - list recommendations', async ({ request }) => {
        const res = await request.get('/api/operator-trust/recommendations?plantId=Demo_Plant_1');
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(Array.isArray(body.recommendations)).toBe(true);
        expect(body.recommendations.length).toBeGreaterThanOrEqual(1);
        
        const rec = body.recommendations.find(r => r.RecommendationID === globalRecId);
        expect(rec).toBeDefined();
        expect(rec.ConfidenceScore).toBeDefined();
    });

    test('3. GET /api/operator-trust/recommendations/:id - fetch single recommendation', async ({ request }) => {
        const res = await request.get(`/api/operator-trust/recommendations/${globalRecId}`);
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(body.recommendation.RecommendationID).toBe(globalRecId);
        expect(Array.isArray(body.feedback)).toBe(true);
        expect(body.outcome).toBeNull();
    });

    test('4. POST /api/operator-trust/feedback - ACCEPT action', async ({ request }) => {
        const res = await request.post('/api/operator-trust/feedback', {
            data: {
                recommendationId: globalRecId,
                action: 'ACCEPT'
            }
        });
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(body.success).toBe(true);
    });

    test('5. POST /api/operator-trust/feedback - REJECT without reasonCode', async ({ request }) => {
        const res = await request.post('/api/operator-trust/feedback', {
            data: {
                recommendationId: globalRecId,
                action: 'REJECT'
            }
        });
        expect(res.status()).toBe(400);
    });

    test('6. POST /api/operator-trust/outcomes - record VALIDATED outcome', async ({ request }) => {
        const res = await request.post('/api/operator-trust/outcomes', {
            data: {
                recommendationId: globalRecId,
                outcomeType: 'VALIDATED',
                matchedWoId: 'WO-TEST-001'
            }
        });
        expect(res.ok()).toBeTruthy();
    });

    test('7. POST /api/operator-trust/outcomes - duplicate outcome returns 409', async ({ request }) => {
        const res = await request.post('/api/operator-trust/outcomes', {
            data: {
                recommendationId: globalRecId,
                outcomeType: 'REFUTED'
            }
        });
        expect(res.status()).toBe(409);
    });

    test('8. GET /api/operator-trust/metrics - aggregate metrics', async ({ request }) => {
        const res = await request.get('/api/operator-trust/metrics?plantId=Demo_Plant_1');
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(body.overall).toBeDefined();
        expect(body.overall.total).toBeGreaterThanOrEqual(1);
        expect(body.byType).toBeDefined();
        expect(body.byType.PREDICTIVE_FORECAST).toBeDefined();
        expect(body.byType.RISK_SCORE).toBeDefined();
        expect(body.byType.VIBRATION_ALERT).toBeDefined();
    });

    test('9. GET /api/predictive-maintenance/forecast - check confidence appended', async ({ request }) => {
        const res = await request.get('/api/predictive-maintenance/forecast', {
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        
        const allItems = [...(body.d30 || []), ...(body.d60 || []), ...(body.d90 || [])];
        if (allItems.length > 0) {
            expect(allItems[0].confidenceScore).toBeDefined();
            expect(allItems[0].confidenceBand).toBeDefined();
        }
    });

    test('10. GET /api/risk-scoring/:plantId - check confidence appended', async ({ request }) => {
        const res = await request.get('/api/risk-scoring/Demo_Plant_1');
        const body = await res.json();
        expect(res.ok()).toBeTruthy();
        expect(body.confidenceScore).toBeDefined();
        expect(body.confidenceBand).toBeDefined();
    });
});
