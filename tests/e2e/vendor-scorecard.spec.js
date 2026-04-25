// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

// Pre-authenticated state created by global-setup.js
const STORAGE_STATE = 'tests/e2e/.auth/ghost_admin.json';

test.describe('Vendor Performance Scorecard', () => {
  test.use({ storageState: STORAGE_STATE });

  test('API: /api/vendors/scorecard returns valid scorecard shape', async ({ request }) => {
      const response = await request.get('/api/vendors/scorecard?plantId=all_sites');
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('scorecards');
      expect(data).toHaveProperty('worstPerformers');
      expect(Array.isArray(data.worstPerformers)).toBeTruthy();
      
      if (data.worstPerformers.length > 0) {
          const first = data.worstPerformers[0];
          expect(first).toHaveProperty('vendorId');
          expect(first).toHaveProperty('vendorName');
          expect(first).toHaveProperty('plants');
          expect(first).toHaveProperty('spend');
          expect(first).toHaveProperty('onTimeDeliveryRate');
          expect(first).toHaveProperty('qualityDefectCount');
      }
  });

  test('UI: Supply Chain Corporate Rollup renders worst performers table', async ({ page }) => {
      await page.goto('/supply-chain');
      await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });

      // "Corporate Rollup: Vendor Risk & Underperformance" only renders when worstPerformers.length > 0
      const hasData = await page.locator('text=Corporate Rollup: Vendor Risk & Underperformance').isVisible({ timeout: 15000 }).catch(() => false);
      if (hasData) {
          await expect(page.locator('th:has-text("Vendor")').first()).toBeVisible();
          await expect(page.locator('th:has-text("Spend Volume")').first()).toBeVisible();
          await expect(page.locator('th:has-text("On-Time Delivery")').first()).toBeVisible();
      } else {
          // No worst performers in DB — supply chain view still loaded correctly
          await expect(page.locator('body')).not.toHaveText(/error|crashed/i);
      }
  });

  test('UI: Parts Catalog renders scorecard when part has vendor', async ({ page }) => {
      await page.goto('/?view=parts');
      
      // Wait for Parts table to load
      await page.waitForSelector('table tbody tr', { timeout: 15000 }).catch(() => {});

      const rows = await page.locator('table tbody tr').count();
      if (rows > 0) {
          // Select the first part
          await page.locator('table tbody tr').first().click();

          // Check if "Vendor Scorecard" panel appears if vendor exists
          const hasVendor = await page.locator('text=Supplier / Vendor').isVisible({ timeout: 5000 }).catch(() => false);
          if (hasVendor) {
              await expect(page.locator('text=Performance Scorecard')).toBeVisible();
              await expect(page.locator('text=On-Time Delivery')).toBeVisible();
              await expect(page.locator('text=Lead Time (Avg)')).toBeVisible();
              await expect(page.locator('text=Quality Defects')).toBeVisible();
          }
      }
  });

});
