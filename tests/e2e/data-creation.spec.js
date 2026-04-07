// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

// Use the ghost admin account to bypass normal constraints but validate the enterprise data path
const ACCOUNT = { username: 'ghost_admin', password: 'Trier3652!' };

test.describe('Trier OS V4.0.0 � Form & Workflow Gauntlet', () => {

  test.beforeEach(async ({ page }) => {
    // Start at root for correct router context
    await page.goto('/');
    
    // Login
    await page.locator('input').first().fill(ACCOUNT.username);
    await page.locator('input[type="password"]').first().fill(ACCOUNT.password);
    await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();

    // Bypass 'Change Password' prompt if inherently present
    try {
      // Wait for security notice
      const updateBtn = page.getByText('Update My Password');
      await updateBtn.waitFor({ state: 'visible', timeout: 10000 });
      await updateBtn.click();
    } catch (e) {}
    
    try {
      const newPasswordInput = page.locator('input[type="password"]').nth(1);
      await newPasswordInput.waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('input[type="password"]').nth(0).fill(ACCOUNT.password);
      await page.locator('input[type="password"]').nth(1).fill(ACCOUNT.password);
      await page.locator('input[type="password"]').nth(2).fill(ACCOUNT.password);
      
      // Target the newly mounted password modal specifically, ensuring it clicks Save, not the background button
      await page.locator('button').filter({ hasText: /Save|Change|Update/i }).last().click();
      await page.waitForTimeout(1000);
      await page.goto('/');
    } catch (e) {}

    // Dismiss the contextual onboarding tour if it exists
    try {
      const skipTourBtn = page.getByText('Skip Tour', { exact: false }).first();
      await skipTourBtn.waitFor({ state: 'visible', timeout: 5000 });
      await skipTourBtn.click();
    } catch (e) {}
    
    // Unconditionally ensure we are routed back to Mission Control
    await page.getByText('Mission Control').last().click({ force: true }).catch(() => {});

    // Explicitly wait for the top-bar to render, proving authentication completed.
    await expect(page.getByText('Mission Control', { exact: false }).first()).toBeVisible({ timeout: 15000 });
  });

  // ==========================================
  // 1. SAFETY EXPERT - Create an Incident
  // ==========================================
  test('Should successfully log a safety incident', async ({ page }) => {
    await page.locator('.mc-container').getByText('Safety', { exact: false }).first().click();
    await expect(page.locator('h2').filter({ hasText: /Safety/i }).first()).toBeVisible({ timeout: 15000 });
    
    // Ensure we are on the Incidents Tab
    await page.locator('button').filter({ hasText: 'Incidents' }).first().click();

    // Locate the Add New Incident / Record Incident button
    const addBtn = page.locator('button').filter({ hasText: /Report Incident|Log Incident/i }).first();
    await addBtn.waitFor({ state: 'visible', timeout: 15000 });
    await addBtn.click();

    // Fill the mandatory form fields
    const modal = page.locator('.modal-content-standard, .modal-overlay').first();
    await expect(modal).toBeVisible();

    await page.locator('input').filter({ has: page.getByText(/Title|Incident/i) }).last().fill(`E2E Ghost Safety Test - ${Date.now()}`).catch(() => page.locator('input').first().fill(`E2E Ghost Safety Test - ${Date.now()}`));
    await page.locator('textarea, input').nth(1).fill('This is an automated E2E penetration test tracking proper data persistence on the Safety module.');
    await page.waitForTimeout(500); // UI breathing room

    if (await page.locator('select').first().isVisible()) {
        await page.locator('select').first().selectOption({ index: 1 });
    }

    // Save
    await page.locator('button.btn-save, button').filter({ hasText: /Save|Submit|Report/i }).first().click();
    
    // Verify modal closes and form submitted successfully
    await expect(modal).not.toBeVisible({ timeout: 15000 });
  });

  // ==========================================
  // 2. LOGISTICS - Submit a DVIR
  // ==========================================
  test('Should successfully create a DVIR log', async ({ page }) => {
    await page.locator('.mc-container').getByText('Logistics & Fleet', { exact: false }).first().click();
    await expect(page.locator('h2').filter({ hasText: /Fleet/i }).first()).toBeVisible({ timeout: 15000 });
    
    // Click DVIR tab
    await page.locator('button').filter({ hasText: 'DVIR' }).first().click();
    
    // Click New DVIR
    const newDvirBtn = page.locator('button').filter({ hasText: 'New DVIR' }).first();
    await newDvirBtn.waitFor({ state: 'visible', timeout: 10000 });
    await newDvirBtn.click();

    // Fill form
    const modal = page.locator('.modal-content-standard, .modal-overlay').first();
    await expect(modal).toBeVisible();

    // Select the first vehicle available by forcing an explicit wait
    const vehicleSelect = page.locator('select').first();
    await vehicleSelect.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500); // Wait for options to hydrate
    await vehicleSelect.selectOption({ index: 1 });
    // Force React standard event propagation fallback
    await vehicleSelect.focus();
    await page.keyboard.press('ArrowDown');
    
    // Fill driver. Focus specifically on the first input.
    await page.locator('input').first().fill('E2E Driver Ghost');
    
    // Fill odometer
    if (await page.locator('input[type="number"]').count() > 0) {
        await page.locator('input[type="number"]').first().fill('130000');
    }
    
    await page.waitForTimeout(500); // Validate bindings
    
    // Save
    await page.locator('button').filter({ hasText: /Create DVIR|Save|Submit/i }).last().click();
    await expect(modal).not.toBeVisible({ timeout: 15000 });
  });

  // ==========================================
  // 3. WAREHOUSING - Add a Hardware Part
  // ==========================================
  test('Should successfully create a supply chain part component', async ({ page }) => {
    await page.locator('.mc-container').getByText('Supply Chain', { exact: false }).first().click();
    await expect(page.locator('h2').filter({ hasText: /Supply|Parts/i }).first()).toBeVisible({ timeout: 15000 });
    
    // Add Part
    const addPartBtn = page.locator('button').filter({ hasText: /Add Part|New Part/i }).first();
    await addPartBtn.waitFor({ state: 'visible', timeout: 15000 });
    await addPartBtn.click();

    const modal = page.locator('.modal-content-standard, .modal-overlay').first();
    await expect(modal).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500); // Let modal animate

    const partNumber = `PT-E2E-${Date.now()}`;
    await page.locator('input').first().fill(partNumber);
    await page.locator('input').nth(1).fill('Automated Verification Component');
    await page.waitForTimeout(500); // React state binding
    
    // Attempt stock filling if available
    const numericInputs = page.locator('input[type="number"]');
    if (await numericInputs.count() > 0) {
        await numericInputs.first().fill('50');
    }

    await page.locator('button').filter({ hasText: /Save|Submit|Create|Add/i }).last().click();
    await expect(modal).not.toBeVisible({ timeout: 15000 });
  });

  // ==========================================
  // 4. Enterprise System CORE - Work Order Injection
  // ==========================================
  test('Should successfully deploy an operational Work Order', async ({ page }) => {
    await page.locator('.mc-container').getByText('Operations', { exact: false }).first().click();
    await expect(page.locator('h1, h2').filter({ hasText: /Operations/i }).first()).toBeVisible({ timeout: 15000 });
    
    // Traverse into the Maintenance sub-module
    await page.getByText('Maintenance', { exact: false }).first().click();
    
    // Switch to Active Work Orders tab
    await page.locator('button').filter({ hasText: 'Active Work Orders' }).first().click();
    
    // Find create job button
    const createBtn = page.locator('button').filter({ hasText: /New|Create|Add/i }).last();
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    await createBtn.click();

    await page.waitForTimeout(1000); // Allow react form mount
    const modalHeading = page.locator('h2, div').filter({ hasText: 'Create New Work Order' }).first();
    await expect(modalHeading).toBeVisible({ timeout: 15000 });
    
    // Fill Work Order #
    const woInput = page.locator('input[type="text"]').first();
    if (await woInput.isVisible()) {
        await woInput.fill(Date.now().toString().slice(-6));
    }

    // Select valid asset
    const assetSelect = page.locator('select').first();
    if (await assetSelect.isVisible()) {
        await assetSelect.selectOption({ index: 1 });
    }
    
    // Fill Work Scope & Comments
    const textAreas = page.locator('textarea');
    if (await textAreas.count() > 0) {
        await textAreas.first().fill('E2E Automated Work Order. Testing end-to-end database deployment and transactional integrity from the UI layer.');
    }
    
    // Finalize transaction by clicking "Create Work Order" or "Create"
    await page.locator('button').filter({ hasText: /Create Work Order|Create/i }).last().click();
    await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 15000 });
  });

  // ==========================================
  // 5. Enterprise System SCHEDULING - Calendar Injection
  // ==========================================
  test('Should successfully schedule a task via the Calendar', async ({ page }) => {
    // Navigate to Operations Hub
    await page.locator('.mc-container').getByText('Operations', { exact: false }).first().click();
    await expect(page.locator('h1, h2').filter({ hasText: /Operations/i }).first()).toBeVisible({ timeout: 15000 });
    
    // Traverse into the Maintenance sub-module
    await page.getByText('Maintenance', { exact: false }).first().click();
    
    // Switch to Calendar tab
    await page.locator('button').filter({ hasText: /Calendar/i }).first().click();
    
    // Wait for the calendar to mount
    // Look for generic day elements
    const calGrid = page.locator('.cal-day-headers, .cal-grid').first();
    await calGrid.waitFor({ state: 'visible', timeout: 15000 });
    
    // Double click a day cell roughly in the middle of the calendar
    const cells = page.locator('.cal-grid > div');
    if (await cells.count() > 15) {
        await cells.nth(15).dblclick();
    } else {
        await page.locator('div').filter({ hasText: /^\d{1,2}$/ }).nth(15).dblclick();
    }

    // The Quick Action modal should open
    await expect(page.locator('.modal-overlay').first()).toBeVisible({ timeout: 15000 });
    
    // Fill descriptive text area or title input
    const input = page.locator('input, textarea').first();
    if (await input.isVisible()) {
        await input.fill('E2E Calendar Injection Event via Automated UI Integration.');
    }
    
    // Trigger creation
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: /Create|Add|Save|Schedule|Confirm/i }).last().click();
    
    // Expect the modal to properly close
    await expect(page.locator('.modal-overlay').first()).not.toBeVisible({ timeout: 15000 });
  });

});
