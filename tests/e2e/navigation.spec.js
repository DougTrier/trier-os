// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

// Use the ghost_tech account to verify basic navigation paths
const ACCOUNT = { username: 'ghost_tech', password: 'Trier3292!' };

test.describe('Trier OS Core Navigation Suite', () => {

  test.beforeEach(async ({ page }) => {
    // Boilerplate login flow before every navigation test
    await page.goto('/');
    
    await page.locator('input[type="text"], input[name="username"]').first().fill(ACCOUNT.username);
    await page.locator('input[type="password"]').first().fill(ACCOUNT.password);
    
    await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();

    // Catch "Change Password" pop up if it exists
    try {
      const newPasswordInput = page.locator('input[type="password"]').nth(1); 
      await newPasswordInput.waitFor({ state: 'visible', timeout: 2000 });
      await page.locator('input[type="password"]').nth(0).fill(ACCOUNT.password);
      await page.locator('input[type="password"]').nth(1).fill(ACCOUNT.password);
      await page.locator('input[type="password"]').nth(2).fill(ACCOUNT.password);
      await page.locator('button').filter({ hasText: /Save|Change/i }).first().click();
    } catch (e) { /* normal flow */ }

    // Wait for login to complete
    await expect(page).not.toHaveURL(/.*login/, { timeout: 10000 });
  });

  test('Should navigate to Work Orders module', async ({ page }) => {
    // Find the Work Orders link/button on the sidebar or Mission Control
    const workOrdersLink = page.getByRole('link', { name: /Work Orders/i });
    if (await workOrdersLink.isVisible()) {
        await workOrdersLink.click();
    } else {
        // Fallback for direct routing if Mission Control tile is obscure
        await page.goto('/jobs');
    }

    // Verify the page actually loaded by checking for standard Work Order headers
    await expect(page.locator('h1, h2').filter({ hasText: /Work Orders/i }).first()).toBeVisible();
  });

  test('Should navigate to Asset Inventory module', async ({ page }) => {
    await page.goto('/assets');
    await expect(page.locator('h1, h2').filter({ hasText: /Assets|Equipment/i }).first()).toBeVisible();
  });

  test('Should navigate to Global Supply Chain (Parts)', async ({ page }) => {
    await page.goto('/parts');
    await expect(page.locator('h1, h2').filter({ hasText: /Parts|Inventory/i }).first()).toBeVisible();
  });

});
