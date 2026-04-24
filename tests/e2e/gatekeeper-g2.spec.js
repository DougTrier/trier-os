// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

test.describe('Gatekeeper Action Registry & Middleware (G2)', () => {
    let permitId;
    let mocId;

    test.beforeAll(async ({ request }) => {
        // Setup LOTO Permit
        let lotoRes = await request.get('/api/loto/permits?plantId=Demo_Plant_1&limit=1');
        let lotoBody = await lotoRes.json();
        
        if (!lotoBody.permits || lotoBody.permits.length === 0) {
            const createLoto = await request.post('/api/loto/permits', {
                data: {
                    plantId: 'Demo_Plant_1',
                    description: 'E2E Gatekeeper LOTO test',
                    issuedBy: 'ghost_admin'
                }
            });
            const cLotoBody = await createLoto.json();
            permitId = cLotoBody.permitId;
        } else {
            permitId = lotoBody.permits[0].ID;
        }

        // Setup MOC Record
        let mocRes = await request.get('/api/moc?plantId=Demo_Plant_1');
        let mocBody = await mocRes.json();
        
        if (mocBody.length === 0) {
            const createMoc = await request.post('/api/moc', {
                data: {
                    plantId: 'Demo_Plant_1',
                    title: 'E2E Gatekeeper MOC test'
                }
            });
            const cMocBody = await createMoc.json();
            mocId = cMocBody.id;
        } else {
            mocId = mocBody[0].ID;
        }
    });

    test('1. POST /api/loto/permits/:id/sign — fail-closed when Gatekeeper unreachable', async ({ request }) => {
        const res = await request.post(`/api/loto/permits/${permitId}/sign`, {
            data: {
                signedBy: 'ghost_admin',
                signatureType: 'WORKER',
                role: 'Worker'
            }
        });
        
        expect(res.status()).toBe(403);
        const body = await res.json();
        expect(body).toHaveProperty('error');
        // Will be GATEKEEPER_NOT_CONFIGURED or GATEKEEPER_UNREACHABLE
        expect(['GATEKEEPER_NOT_CONFIGURED', 'GATEKEEPER_UNREACHABLE']).toContain(body.error);
    });

    test('2. POST /api/moc/:id/approve — fail-closed when Gatekeeper unreachable', async ({ request }) => {
        const res = await request.post(`/api/moc/${mocId}/approve`, {
            data: {
                decision: 'APPROVED',
                approvedBy: 'ghost_admin',
                comments: 'Looks good'
            }
        });
        
        expect(res.status()).toBe(403);
        const body = await res.json();
        expect(body).toHaveProperty('error');
        expect(['GATEKEEPER_NOT_CONFIGURED', 'GATEKEEPER_UNREACHABLE']).toContain(body.error);
    });

    test.describe('With Gatekeeper running', () => {
        let gatekeeperProcess;

        test.beforeAll(async () => {
            const { spawn } = require('child_process');
            gatekeeperProcess = spawn('node', ['server/gatekeeper/index.js'], {
                env: { ...process.env, GATEKEEPER_PORT: '4001' },
                stdio: 'pipe'
            });
            // Wait for Gatekeeper to be ready
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Gatekeeper startup timeout')), 10000);
                gatekeeperProcess.stdout.on('data', (data) => {
                    if (data.toString().includes('listening')) {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
                gatekeeperProcess.on('error', reject);
            });
        });

        test.afterAll(async () => {
            if (gatekeeperProcess) gatekeeperProcess.kill();
        });

        test('3. POST /api/loto/permits/:id/sign — Gatekeeper running, RBAC denies (LDAP not configured)', async ({ request }) => {
            const lotoRes = await request.get('/api/loto/permits?plantId=Demo_Plant_1&limit=1');
            const lotoBody = await lotoRes.json();
            const permitId = lotoBody.permits?.[0]?.ID ?? 1;

            const res = await request.post(`/api/loto/permits/${permitId}/sign`, {
                data: { signedBy: 'ghost_admin', signatureType: 'WORKER', role: 'Worker' }
            });
            expect(res.status()).toBe(403);
            const body = await res.json();
            expect(body.error).toBe('LDAP_REQUIRED_FOR_SAFETY_CRITICAL');
        });

        test('4. POST /api/moc/:id/approve — Gatekeeper running, RBAC denies (LDAP not configured)', async ({ request }) => {
            const mocRes = await request.get('/api/moc?plantId=Demo_Plant_1');
            const mocBody = await mocRes.json();
            const mocId = mocBody[0]?.ID ?? 1;

            const res = await request.post(`/api/moc/${mocId}/approve`, {
                data: { decision: 'APPROVED', approvedBy: 'ghost_admin', comments: 'G6 re-enable check' }
            });
            expect(res.status()).toBe(403);
            const body = await res.json();
            expect(body.error).toBe('LDAP_REQUIRED_FOR_SAFETY_CRITICAL');
        });
    });
});
