// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('P5-4 SOP Re-Acknowledgment Flow', () => {
    test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });

    test.beforeAll(async () => {
        // Seed the plant DB with a test procedure and link it to an asset.
        // The seed script opens a direct SQLite connection; allow 400ms for the
        // server's connection pool to see the WAL changes before the first API call.
        execSync(`node tests/e2e/seed_sop.js`, { stdio: 'inherit' });
        await new Promise(r => setTimeout(r, 400));
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
        // Set plant context so SOPAcknowledgmentBanner queries Demo_Plant_1 (not all_sites default)
        await page.goto('/');
        await page.evaluate(() => localStorage.setItem('selectedPlantId', 'Demo_Plant_1'));
        await page.goto('/jobs');
        
        const banner = page.locator('text=SOP Acknowledgment Required').first();
        await expect(banner).toBeVisible();

        // Step 6: Tech clicks banner, reads SOP, signs off
        await banner.click();

        await expect(page.locator('text=Pending SOP Acknowledgments')).toBeVisible();

        await page.locator('button:has-text("Acknowledge & Sign")').first().click();

        // SOPAcknowledgmentBanner returns null when pendingSOPs is empty (line 52),
        // so the entire component — including the modal — unmounts after the last ack.
        // The "All required procedures" text inside the modal is dead code; verify
        // the banner has disappeared instead.
        await expect(banner).not.toBeVisible({ timeout: 15000 });
    });
});
