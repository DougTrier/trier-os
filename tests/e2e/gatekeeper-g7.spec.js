import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

test.describe('Gatekeeper Audit Ledger API (G7)', () => {

    test('1. GET /api/gatekeeper/audit — returns 200, body has records and total', async ({ request }) => {
        const response = await request.get('/api/gatekeeper/audit');
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        expect(Array.isArray(body.records)).toBe(true);
        expect(typeof body.total).toBe('number');
        expect(typeof body.limit).toBe('number');
        expect(typeof body.offset).toBe('number');
    });

    test('2. GET /api/gatekeeper/audit/integrity — returns 200, triggersPresent: true, integrityStatus: OK', async ({ request }) => {
        const response = await request.get('/api/gatekeeper/audit/integrity');
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        expect(body.triggersPresent).toBe(true);
        expect(body.integrityStatus).toBe('OK');
        expect(Array.isArray(body.triggers)).toBe(true);
        expect(body.triggers).toContain('prevent_audit_update');
        expect(body.triggers).toContain('prevent_audit_delete');
    });

    test('3. GET /api/gatekeeper/audit/:id with a valid ID', async ({ request }) => {
        // Fetch list to get a valid ID
        const listRes = await request.get('/api/gatekeeper/audit');
        const listBody = await listRes.json();
        
        if (listBody.records.length === 0) {
            test.skip(true, 'No audit records exist yet. Requires a prior Gatekeeper-involved request.');
            return;
        }

        const validId = listBody.records[0].LedgerID;
        const response = await request.get(`/api/gatekeeper/audit/${validId}`);
        expect(response.status()).toBe(200);
        
        const record = await response.json();
        expect(record.LedgerID).toBe(validId);
    });

    test('4. GET /api/gatekeeper/audit/:id with ID 99999999 — returns 404', async ({ request }) => {
        const response = await request.get('/api/gatekeeper/audit/99999999');
        expect(response.status()).toBe(404);
        
        const body = await response.json();
        expect(body.error).toBe('Record not found');
    });

    test('5. GET /api/gatekeeper/audit/:id with ID not-a-number — returns 400', async ({ request }) => {
        const response = await request.get('/api/gatekeeper/audit/not-a-number');
        expect(response.status()).toBe(400);
        
        const body = await response.json();
        expect(body.error).toBe('Invalid LedgerID');
    });

    test('6. GET /api/gatekeeper/audit with validationResult=ALLOWED filter', async ({ request }) => {
        const response = await request.get('/api/gatekeeper/audit?validationResult=ALLOWED');
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        expect(Array.isArray(body.records)).toBe(true);
        
        for (const record of body.records) {
            expect(record.ValidationResult).toBe('ALLOWED');
        }
    });

});
