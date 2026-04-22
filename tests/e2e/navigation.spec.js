// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

// Pre-authenticated state created by global-setup.js — no beforeEach login needed
const STORAGE_STATE = 'tests/e2e/.auth/ghost_tech.json';

test.describe('Trier OS Core Navigation Suite', () => {
  // Load the saved authenticated session so we don't log in on every test
  test.use({ storageState: STORAGE_STATE });

  test('Should navigate to Work Orders module', async ({ page }) => {
    await page.goto('/jobs', { waitUntil: 'domcontentloaded' });

    // Verify the page actually loaded by checking for standard Work Order headers
    await expect(page.locator('h1, h2').filter({ hasText: /Work Orders|Jobs/i }).first()).toBeVisible({ timeout: 15000 });
  });

  test('Should navigate to Asset Inventory module', async ({ page }) => {
    await page.goto('/assets', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1, h2').filter({ hasText: /Assets|Equipment/i }).first()).toBeVisible({ timeout: 15000 });
  });

  test('Should navigate to Global Supply Chain (Parts)', async ({ page }) => {
    await page.goto('/parts', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1, h2').filter({ hasText: /Parts|Inventory|Logistics/i }).first()).toBeVisible({ timeout: 15000 });
  });

});

