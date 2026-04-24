// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';

test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

test.describe('Gatekeeper Engine Pipeline (G6)', () => {
    let gatekeeperProcess;
    const GATEKEEPER_URL = 'http://127.0.0.1:4001';

    test.beforeAll(async () => {
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

    test('1. Malformed intent (no requestId) → MALFORMED_INTENT', async ({ request }) => {
        const res = await request.post(`${GATEKEEPER_URL}/validate-intent`, {
            data: { userId: 'u1', username: 'ghost_admin', actionType: 'WORK_ORDER_CREATE' }
        });
        const body = await res.json();
        expect(body.allowed).toBe(false);
        expect(body.denialReason).toBe('MALFORMED_INTENT');
    });

    test('2. READ_ONLY action → allowed:true, no validators run', async ({ request }) => {
        const res = await request.post(`${GATEKEEPER_URL}/validate-intent`, {
            data: {
                requestId: 'test-' + Date.now() + '-readonly',
                userId: 'u1', username: 'ghost_admin',
                actionType: 'REPORT_READ', actionClass: 'READ_ONLY',
                plantId: 'Demo_Plant_1'
            }
        });
        const body = await res.json();
        expect(body.allowed).toBe(true);
    });

    test('3. NON_CRITICAL action, LDAP not configured → allowed:true (RBAC passes through)', async ({ request }) => {
        const res = await request.post(`${GATEKEEPER_URL}/validate-intent`, {
            data: {
                requestId: 'test-' + Date.now() + '-noncrit',
                userId: 'u1', username: 'ghost_admin',
                actionType: 'WORK_ORDER_CREATE', actionClass: 'NON_CRITICAL',
                plantId: 'Demo_Plant_1'
            }
        });
        const body = await res.json();
        expect(body.allowed).toBe(true);
        expect(body).toHaveProperty('processingMs');
    });

    test('4. SAFETY_CRITICAL action, LDAP not configured → LDAP_REQUIRED_FOR_SAFETY_CRITICAL', async ({ request }) => {
        const res = await request.post(`${GATEKEEPER_URL}/validate-intent`, {
            data: {
                requestId: 'test-' + Date.now() + '-safetycrit',
                userId: 'u1', username: 'ghost_admin',
                actionType: 'LOTO_ACTIVATE', actionClass: 'SAFETY_CRITICAL',
                plantId: 'Demo_Plant_1'
            }
        });
        const body = await res.json();
        expect(body.allowed).toBe(false);
        expect(body.denialReason).toBe('LDAP_REQUIRED_FOR_SAFETY_CRITICAL');
    });

    test('5. Duplicate requestId → DUPLICATE_REQUEST_ID', async ({ request }) => {
        const requestId = 'test-dup-' + Date.now();
        const payload = {
            requestId,
            userId: 'u1', username: 'ghost_admin',
            actionType: 'WORK_ORDER_CREATE', actionClass: 'NON_CRITICAL',
            plantId: 'Demo_Plant_1'
        };

        // First attempt
        await request.post(`${GATEKEEPER_URL}/validate-intent`, { data: payload });

        // Second attempt with same requestId
        const res2 = await request.post(`${GATEKEEPER_URL}/validate-intent`, { data: payload });
        const body2 = await res2.json();
        expect(body2.allowed).toBe(false);
        expect(body2.denialReason).toBe('DUPLICATE_REQUEST_ID');
    });
});
