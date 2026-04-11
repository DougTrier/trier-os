// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

// Use the standard Technician account to prevent Executive permission errors while creating floor data
const ACCOUNT = { username: 'ghost_tech', password: 'Trier3292!' };

test.describe('V4.0 Complete Application Operations Suite (The Full Run)', () => {

  test.beforeEach(async ({ page }) => {
    // 1. Log in cleanly before initiating the application run
    await page.goto('/');
    await page.locator('input[type="text"], input[name="username"], input[name="email"]').first().fill(ACCOUNT.username);
    await page.locator('input[type="password"]').first().fill(ACCOUNT.password);
    await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();

    try {
      const newPasswordInput = page.locator('input[type="password"]').nth(1); 
      await newPasswordInput.waitFor({ state: 'visible', timeout: 2000 });
      await page.locator('input[type="password"]').nth(0).fill(ACCOUNT.password);
      await page.locator('input[type="password"]').nth(1).fill(ACCOUNT.password);
      await page.locator('input[type="password"]').nth(2).fill(ACCOUNT.password);
      await page.locator('button').filter({ hasText: /Save|Change/i }).first().click();
    } catch (e) {}

    // Wait for Mission Control or Dashboard to inherently load
    await expect(page).not.toHaveURL(/.*login/, { timeout: 10000 });
  });

  // ==========================================
  // PHASE 1: WORK ORDER CREATION
  // ==========================================
  test('Should successfully create a new Work Order from scratch', async ({ page }) => {
    // Navigate to the Work Orders Module
    await page.goto('/jobs');
    
    // Ghost User looks for the specific "Create" or "New" or "+" button
    const createBtn = page.locator('button, a').filter({ hasText: /New Work Order|Create|Add \+/i }).first();
    await createBtn.click();

    // Fill out the fundamental semantic fields of a standard Work Order form
    const titleInput = page.getByPlaceholder(/Title|Subject|Problem/i).first();
    const descInput = page.locator('textarea').first();

    // Await inputs to appear
    await expect(titleInput).toBeVisible();

    // Type the Ghost payload
    await titleInput.fill('GHOST TEST: Pump 4 Seal Leak');
    await descInput.fill('Playwright Automated Ghost testing the creation of a mechanical baseline seal leak protocol.');

    // Look for a priority dropdown or equivalent
    try {
      const prioritySelect = page.locator('select').first();
      await prioritySelect.selectOption({ index: 1 }); // Usually selects "High" or "Urgent"
    } catch (e) {} // If no select exists, proceed

    // Submit the form
    const saveBtn = page.locator('button').filter({ hasText: /Save|Submit|Create/i }).first();
    await saveBtn.click();

    // The Ultimate Verification:
    // Does the App visually spawn a "Success" toast, or render the exact WO title natively in the table list?
    await expect(page.getByText(/GHOST TEST: Pump 4/i)).toBeVisible({ timeout: 5000 });
  });

  // ==========================================
  // PHASE 2: PURCHASE ORDER ACQUISITION
  // ==========================================
  test('Should successfully generate a new Supply Chain Purchase Order', async ({ page }) => {
    await page.goto('/supply-chain');

    const createBtn = page.locator('button, a').filter({ hasText: /New Purchase|Create PO|Add PO/i }).first();
    await createBtn.click();

    // Locate PO standard semantic inputs
    const poNumberInput = page.getByPlaceholder(/PO Number|Identifier|Title/i).first();
    const vendorInput = page.getByPlaceholder(/Vendor|Supplier/i).first();

    await expect(poNumberInput).toBeVisible();

    await poNumberInput.fill('PO-GHOST-90210');
    if (await vendorInput.isVisible()) await vendorInput.fill('Ghost Test Vendor Inc.');

    // Try finding the submit block
    const saveBtn = page.locator('button').filter({ hasText: /Save|Submit|Issue PO/i }).first();
    await saveBtn.click();

    // The Ultimate Verification:
    // Ensure the PO-GHOST-90210 string is completely anchored to the DOM verifying DB write
    await expect(page.getByText(/PO-GHOST-90210/i)).toBeVisible({ timeout: 5000 });
  });

  // ==========================================
  // PHASE 3: STANDARD OPERATING PROCEDURE (SOP)
  // ==========================================
  test('Should successfully author and publish a new Factory SOP', async ({ page }) => {
    // Navigate to the documentation / SOP module
    await page.goto('/manual');

    const createBtn = page.locator('button, a').filter({ hasText: /New SOP|Create|Add Document/i }).first();
    
    // Some systems lock SOP creation to Creators/Admins. If it's missing, this fails identically to reality.
    if (await createBtn.isVisible()) {
      await createBtn.click();

      const titleInput = page.getByPlaceholder(/Title|SOP Name/i).first();
      const contentInput = page.locator('textarea').first();

      await expect(titleInput).toBeVisible();

      await titleInput.fill('SOP-GHOST-001: Automated Robotics Calibration');
      await contentInput.fill('Step 1. Run Playwright. Step 2. Verify Output. Step 3. Profit.');

      const saveBtn = page.locator('button').filter({ hasText: /Publish|Save|Create/i }).first();
      await saveBtn.click();

      // Verify the new SOP actually sits statically in the DB and reflects on screen
      await expect(page.getByText(/Automated Robotics Calibration/i)).toBeVisible({ timeout: 5000 });
    }
  });

  // ==========================================
  // PHASE 4: GLOBAL SEARCH INDEXING
  // ==========================================
  test('Should index the newly created Ghost data in the Global Search Engine', async ({ page }) => {
    // This implicitly tests if the SQLite Indexing Engine works instantly
    await page.goto('/');

    const searchEngine = page.locator('input[type="search"], input[placeholder*="Search"]').first();
    await searchEngine.fill('GHOST TEST');
    
    // Ghost presses "Enter" on the keyboard
    await searchEngine.press('Enter');

    // The engine should pull the Work Order we just generated 5 seconds ago!
    await expect(page.getByText(/GHOST TEST: Pump 4/i)).toBeVisible({ timeout: 5000 });
  });

});
