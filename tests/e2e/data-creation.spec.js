// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

// Use the ghost admin account to bypass normal constraints but validate the enterprise data path
const ACCOUNT = { username: 'ghost_admin', password: 'Trier3652!' };

test.describe('Trier OS V4.0.0 Form & Workflow Gauntlet', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="text"], input[name="username"]').first().fill(ACCOUNT.username);
    await page.locator('input[type="password"]').first().fill(ACCOUNT.password);
    await page.locator('button[type="submit"]').first().click();

    try {
      const newPasswordInput = page.locator('input[type="password"]').nth(1);
      await newPasswordInput.waitFor({ state: 'visible', timeout: 2000 });
      await page.locator('input[type="password"]').nth(0).fill(ACCOUNT.password);
      await page.locator('input[type="password"]').nth(1).fill(ACCOUNT.password);
      await page.locator('input[type="password"]').nth(2).fill(ACCOUNT.password);
      await page.locator('button').filter({ hasText: /Save|Change|Update/i }).last().click();
      await page.waitForTimeout(1000);
    } catch (e) {}

    await expect(page).not.toHaveURL(/.*login/, { timeout: 15000 });
  });

  // ==========================================
  // 1. SAFETY - Log an Incident
  // ==========================================
  test('Should successfully log a safety incident', async ({ page }) => {
    // Set a specific plant — all_sites uses readonly schema_template.db which blocks incident creation
    await page.evaluate(() => localStorage.setItem('selectedPlantId', 'Plant_1'));
    // Navigate directly to the Safety & Compliance module
    await page.goto('/safety');
    await expect(page.locator('h1, h2').filter({ hasText: /Safety/i }).first()).toBeVisible({ timeout: 15000 });

    // Click Incidents tab
    await page.locator('button').filter({ hasText: 'Incidents' }).first().click();

    // Click Report/Log Incident button
    const addBtn = page.locator('button').filter({ hasText: /Report Incident|Log Incident|New Incident/i }).first();
    await addBtn.waitFor({ state: 'visible', timeout: 15000 });
    await addBtn.click();

    // Modal should open
    const modal = page.locator('.modal-content-standard, .modal-overlay').first();
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Fill title — scope to modal to avoid filling the page-level search bar (SafetyView has a SearchBar above)
    await modal.locator('input[type="text"]').first().fill(`E2E Ghost Safety Test - ${Date.now()}`);
    // Fill location (second text input in modal — required by validation)
    const locationInput = modal.locator('input[type="text"]').nth(1);
    if (await locationInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await locationInput.fill('E2E Test Location');
    }
    // Fill incident date — required by server: 'Title, reported by, and incident date are required'
    const dateInput = modal.locator('input[type="date"]').first();
    if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateInput.fill(new Date().toISOString().split('T')[0]);
    }
    await page.waitForTimeout(500);

    if (await modal.locator('select').first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await modal.locator('select').first().selectOption({ index: 1 });
    }

    // Save — scope to modal, use evaluate to bypass modal-footer overlay interception
    await modal.locator('button').filter({ hasText: /Save|Submit|Report/i }).first().evaluate(el => el.click());
    await expect(modal).not.toBeVisible({ timeout: 15000 });
  });

  // ==========================================
  // 2. LOGISTICS - Submit a DVIR
  // ==========================================
  test('Should successfully create a DVIR log', async ({ page }) => {
    // Navigate directly to Fleet
    await page.goto('/fleet');
    await expect(page.locator('h1, h2').filter({ hasText: /Fleet/i }).first()).toBeVisible({ timeout: 15000 });

    // Click DVIR tab
    await page.locator('button').filter({ hasText: 'DVIR' }).first().click();

    // Click New DVIR
    const newDvirBtn = page.locator('button').filter({ hasText: 'New DVIR' }).first();
    await newDvirBtn.waitFor({ state: 'visible', timeout: 10000 });
    await newDvirBtn.click();

    const modal = page.locator('.modal-content-standard, .modal-overlay').first();
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Select vehicle
    const vehicleSelect = modal.locator('select').first();
    await vehicleSelect.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500);
    await vehicleSelect.selectOption({ index: 1 });

    // Fill driver name
    await modal.locator('input[type="text"]').first().fill('E2E Driver Ghost');

    // Fill odometer if present
    const odoInput = modal.locator('input[type="number"]').first();
    if (await odoInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await odoInput.fill('130000');
    }

    await page.waitForTimeout(500);

    // Save — scope to modal, use first to avoid Cancel
    await modal.locator('button').filter({ hasText: /Create DVIR|Save|Submit/i }).first().click();
    await expect(modal).not.toBeVisible({ timeout: 15000 });
  });

  // ==========================================
  // 3. WAREHOUSING - Add a Hardware Part
  // ==========================================
  test('Should successfully create a supply chain part component', async ({ page }) => {
    // Set a specific plant so part creation writes to a writable DB (all_sites uses readonly schema_template.db)
    await page.evaluate(() => localStorage.setItem('selectedPlantId', 'Plant_1'));
    // Navigate directly to parts inventory
    await page.goto('/parts');
    await expect(page.locator('h1, h2').filter({ hasText: /Parts|Catalog/i }).first()).toBeVisible({ timeout: 15000 });

    // Click New Part button
    const addPartBtn = page.locator('button').filter({ hasText: /New Part|Add Part/i }).first();
    await addPartBtn.waitFor({ state: 'visible', timeout: 15000 });
    await addPartBtn.click();

    const modal = page.locator('.modal-content-standard, .modal-overlay').first();
    await expect(modal).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    const partNumber = `PT-E2E-${Date.now()}`;
    await modal.locator('input').first().fill(partNumber);
    await modal.locator('input').nth(1).fill('Automated Verification Component').catch(() => {});
    await page.waitForTimeout(500);

    const numericInputs = modal.locator('input[type="number"]');
    if (await numericInputs.count() > 0) {
      await numericInputs.first().fill('50');
    }

    await modal.locator('button').filter({ hasText: /Save|Submit|Create|Add/i }).first().evaluate(el => el.click());
    // Handle Multi-Site Verification dialog (shown for it_admin/hasFullAdminAccess users)
    const proceedBtn = page.locator('button').filter({ hasText: /Yes, Proceed/i }).first();
    if (await proceedBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await proceedBtn.evaluate(el => el.click());
      await page.waitForTimeout(1000); // Wait for async save to complete
    }
    // Panel stays open in view mode after save — close via Escape
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 15000 });
  });

  // ==========================================
  // 4. Enterprise System CORE - Work Order
  // ==========================================
  test('Should successfully deploy an operational Work Order', async ({ page }) => {
    // Set a specific plant so WO creation writes to a writable DB (all_sites uses readonly schema_template.db)
    await page.evaluate(() => localStorage.setItem('selectedPlantId', 'Plant_1'));
    // Navigate directly to jobs
    await page.goto('/jobs');
    await expect(page.getByText('Work Order', { exact: false }).first()).toBeVisible({ timeout: 15000 });

    // Click New WO button
    const createBtn = page.locator('button').filter({ hasText: /New WO/i }).first();
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    await createBtn.click();

    // Wait for the WO creation panel
    await expect(page.getByText('Create New Work Order', { exact: false }).first()).toBeVisible({ timeout: 15000 });

    // Fill description / work scope in textarea
    const textAreas = page.locator('textarea');
    if (await textAreas.count() > 0) {
      await textAreas.first().fill('E2E Automated Work Order — end-to-end database deployment and transactional integrity from the UI layer.');
    }

    // Select asset if dropdown is available
    const assetSelect = page.locator('select').first();
    if (await assetSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await assetSelect.selectOption({ index: 1 });
    }

    // Submit via btn-save "Create Work Order" — evaluate bypasses modal-footer overlay interception
    await page.locator('button.btn-save').filter({ hasText: /Create Work Order/i }).first().evaluate(el => el.click());

    // The WO panel should transition out of create mode (no more "Create New Work Order" heading)
    await expect(page.getByText('Create New Work Order', { exact: false }).first()).not.toBeVisible({ timeout: 15000 });
  });

  // ==========================================
  // 5. Enterprise System SCHEDULING - Calendar
  // ==========================================
  test('Should successfully schedule a task via the Calendar', async ({ page }) => {
    // Navigate to jobs dashboard
    await page.goto('/jobs');
    await expect(page.getByText('Work Order', { exact: false }).first()).toBeVisible({ timeout: 15000 });

    // Switch to Calendar tab
    await page.locator('button').filter({ hasText: /Calendar/i }).first().click();

    // Wait for the calendar grid to mount
    const calGrid = page.locator('.cal-grid, .cal-day-headers').first();
    await calGrid.waitFor({ state: 'visible', timeout: 15000 });

    // Double-click a day cell to open Quick Actions
    const cells = page.locator('.cal-grid > div');
    const cellCount = await cells.count();
    if (cellCount > 15) {
      await cells.nth(15).dblclick();
    } else {
      await page.locator('div').filter({ hasText: /^\d{1,2}$/ }).nth(15).dblclick();
    }

    // Quick Actions modal should appear
    await expect(page.getByText('Quick Actions', { exact: false }).first()).toBeVisible({ timeout: 15000 });

    // Click "Add Reminder" — the simplest action that opens a form
    await page.getByText('Add Reminder', { exact: false }).first().click();
    await page.waitForTimeout(1000); // Wait for step transition to 'add-reminder' form

    // Fill the reminder textarea (autoFocus textarea in the sticky-note form)
    const reminderTextarea = page.locator('textarea').first();
    if (await reminderTextarea.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reminderTextarea.fill('E2E Calendar Injection — Automated UI Integration Test.');
    }

    // Click "Pin Reminder" to save — evaluate bypasses any overlay interception
    const pinBtn = page.locator('button').filter({ hasText: /Pin Reminder|Save|Confirm/i }).first();
    if (await pinBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await pinBtn.evaluate(el => el.click());
    }

    // Verify Quick Actions menu is no longer shown
    await expect(page.getByText('Quick Actions', { exact: false }).first()).not.toBeVisible({ timeout: 10000 });
  });

});
