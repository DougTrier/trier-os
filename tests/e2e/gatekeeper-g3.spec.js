// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

test.describe('Gatekeeper RBAC Validator (G3)', () => {
    
    test('1. GET /api/ldap/role-map — returns 200 and an array', async ({ request }) => {
        const res = await request.get('/api/ldap/role-map');
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
    });

    test('2. PUT /api/ldap/role-map — upserts a test entry', async ({ request }) => {
        const res = await request.put('/api/ldap/role-map', {
            data: {
                adGroup: 'CN=TestGroup,DC=corp,DC=local',
                actionClass: 'NON_CRITICAL'
            }
        });
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body).toHaveProperty('id');
    });

    test('3. GET /api/ldap/role-map after PUT — array contains the entry just written', async ({ request }) => {
        const res = await request.get('/api/ldap/role-map');
        expect(res.status()).toBe(200);
        const body = await res.json();
        
        const found = body.find(r => r.ADGroup === 'CN=TestGroup,DC=corp,DC=local' && r.ActionClass === 'NON_CRITICAL');
        expect(found).toBeDefined();
    });

    test('4. PUT /api/ldap/role-map with invalid actionClass — returns 400', async ({ request }) => {
        const res = await request.put('/api/ldap/role-map', {
            data: {
                adGroup: 'CN=TestGroup,DC=corp,DC=local',
                actionClass: 'INVALID_CLASS'
            }
        });
        expect(res.status()).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('Invalid actionClass');
    });
});
