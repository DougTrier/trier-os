// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

test.describe('Gatekeeper PTW Validator (G4)', () => {

    test('1. POST /api/loto/permits/:id/sign — still fail-closed when Gatekeeper unreachable', async ({ request }) => {
        // G4 does not change endpoint gating — LOTO sign still blocked by middleware.
        // This confirms the validation chain (RBAC + PTW) does not break existing fail-closed behavior.
        const lotoRes = await request.get('/api/loto/permits?plantId=Demo_Plant_1&limit=1');
        const lotoBody = await lotoRes.json();
        const permitId = lotoBody.permits?.[0]?.ID ?? 1;

        const res = await request.post(`/api/loto/permits/${permitId}/sign`, {
            data: { signedBy: 'ghost_admin', signatureType: 'WORKER', role: 'Worker' }
        });
        expect(res.status()).toBe(403);
        const body = await res.json();
        expect(['GATEKEEPER_NOT_CONFIGURED', 'GATEKEEPER_UNREACHABLE']).toContain(body.error);
    });

    test('2. POST /api/moc/:id/approve — still fail-closed when Gatekeeper unreachable', async ({ request }) => {
        const mocRes = await request.get('/api/moc?plantId=Demo_Plant_1');
        const mocBody = await mocRes.json();
        const mocId = mocBody[0]?.ID ?? 1;

        const res = await request.post(`/api/moc/${mocId}/approve`, {
            data: { decision: 'APPROVED', approvedBy: 'ghost_admin', comments: 'G4 regression check' }
        });
        expect(res.status()).toBe(403);
        const body = await res.json();
        expect(['GATEKEEPER_NOT_CONFIGURED', 'GATEKEEPER_UNREACHABLE']).toContain(body.error);
    });

    test.skip('3. SETPOINT_WRITE — denied PTW_REQUIRED when no active permit (Gatekeeper running)', async ({ request }) => {
        // TODO G6: re-enable when Gatekeeper is started in E2E environment and
        // a route using requireGatekeeper('SETPOINT_WRITE', ...) exists.
    });

    test.skip('4. SETPOINT_WRITE — allowed when active LOTO permit exists (Gatekeeper running)', async ({ request }) => {
        // TODO G6: re-enable once end-to-end Gatekeeper validation is exercised in E2E.
    });
});
