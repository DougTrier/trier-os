// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('P5-4 SOP Re-Acknowledgment Flow', () => {
    test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

    test.beforeAll(async () => {
        // Seed the plant DB with a test procedure and link it to an asset
        execSync(`node tests/e2e/seed_sop.js`, { stdio: 'inherit' });
    });

    test('MOC Close flags SOPs and Banner appears on WO view', async ({ page, request }) => {
        // Step 1: Create an MOC
        const mocRes = await request.post('/api/moc', {
            data: {
                plantId: 'Demo_Plant_1',
                title: 'E2E MOC SOP Test',
                Title: 'E2E MOC SOP Test',
                Description: 'Test',
                Justification: 'Test',
                ChangeType: 'Process',
                RiskLevel: 'Low',
                Status: 'DRAFT',
                TargetDate: new Date().toISOString()
            },
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        if (!mocRes.ok()) {
            console.log('MOC Creation Failed:', await mocRes.text());
        }
        expect(mocRes.ok()).toBeTruthy();
        const mocData = await mocRes.json();
        const mocId = mocData.id;

        // Step 2: Link procedure to MOC
        await request.post(`/api/moc/${mocId}/affected`, {
            data: {
                itemType: 'PROCEDURE',
                itemId: 'PROC-TEST-1',
                itemLabel: 'Test Procedure',
                notes: 'Test'
            },
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });

        // Step 3: Close MOC
        await request.put(`/api/moc/${mocId}`, {
            data: { Status: 'COMPLETED' },
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });

        // Step 4: Create a Work Order for AST-TEST-1 assigned to ghost_admin
        const nextIdRes = await request.get('/api/work-orders/next-id', {
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        const { nextID } = await nextIdRes.json();

        const woRes = await request.post('/api/work-orders', {
            data: {
                ID: nextID,
                Description: 'Test WO for SOP Ack',
                AstID: 'AST-TEST-1',
                AssignToID: 'ghost_admin',
                Priority: '3',
                StatusID: 'OPEN'
            },
            headers: { 'x-plant-id': 'Demo_Plant_1' }
        });
        expect(woRes.ok()).toBeTruthy();
        const woData = await woRes.json();
        expect(woData.pendingSopWarning).toBe(true);

        // Step 5: Go to WO view and verify banner
        await page.goto('/work-orders');
        
        const banner = page.locator('text=SOP Acknowledgment Required').first();
        await expect(banner).toBeVisible();

        // Step 6: Tech clicks banner, reads SOP, signs off
        await banner.click();
        
        await expect(page.locator('text=Pending SOP Acknowledgments')).toBeVisible();
        
        await page.locator('button:has-text("Acknowledge & Sign")').first().click();
        
        await expect(page.locator('text=All required procedures have been acknowledged.')).toBeVisible();
        
        await page.locator('button:has-text("Close")').click();
        
        await expect(banner).not.toBeVisible();
    });
});
