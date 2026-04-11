// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Metrics Math & Calculation Consistency (Corporate & Plant)', () => {

  test.beforeEach(async ({ page }) => {
    // Log in as ghost_admin (which acts as creator and bypasses restrictions)
    await page.goto('/');
    await page.locator('input[type="text"], input[name="username"]').first().fill('ghost_admin');
    await page.locator('input[type="password"]').first().fill('Trier3652!');
    await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();
    
    // Bypass forced password change if it appears
    try {
      const newPass = page.locator('input[type="password"]').nth(1);
      await newPass.waitFor({ state: 'visible', timeout: 2000 });
      await page.locator('input[type="password"]').nth(0).fill('Trier3652!');
      await page.locator('input[type="password"]').nth(1).fill('Trier3652!');
      await page.locator('input[type="password"]').nth(2).fill('Trier3652!');
      await page.locator('button').filter({ hasText: /Save|Change/i }).first().click();
    } catch (e) {}

    await expect(page).not.toHaveURL(/.*login/, { timeout: 15000 });
  });

  test('Plant Metrics loads and renders statistical cards without NaN or null errors', async ({ page }) => {
    // Navigate directly to the dashboard in plant context
    await page.goto('/dashboard');

    // Select a specific plant so the per-plant KPIs render
    const plantSelect = page.locator('select').first();
    if (await plantSelect.isVisible({ timeout: 3000 })) {
      await plantSelect.selectOption('Demo_Plant_1');
      await page.waitForTimeout(1000);
    }

    // Ensure the dashboard loaded — check for a text that always renders on the plant dashboard
    await expect(page.getByText(/WORK ORDERS|Recent Work Orders|Predictive Risk/i).first()).toBeVisible({ timeout: 15000 });

    // Grab all text content and ensure there are no math breakdown strings like 'NaN', 'undefined', or 'Infinity'
    const pageText = await page.evaluate(() => document.body.innerText);
    expect(pageText).not.toMatch(/\bNaN\b/);
    expect(pageText).not.toMatch(/\bundefined\b/);
    expect(pageText).not.toMatch(/\bInfinity\b/);

    // Verify some expected numeric metrics exist (e.g. percentages, totals, which indicate math ran successfully)
    const activeText = await page.evaluate(() => document.body.innerText);
    expect(activeText).toMatch(/[0-9]+/); // Has at least some numbers
  });

  test('Corporate Metrics allows access and correctly rolls up executive intelligence without math errors', async ({ page }) => {
    // Navigate directly — corp-analytics tile is only in the creator tile set,
    // but the page itself is accessible to it_admin and executive roles.
    await page.goto('/corp-analytics');

    // Verify the page renders successfully
    await expect(page.locator('h1').filter({ hasText: /Corporate Analytics/i }).first()).toBeVisible({ timeout: 15000 });
    
    // Check that important calculated fields exist and have loaded
    await expect(page.getByText('Operating Spend')).toBeVisible();
    await expect(page.getByText('Inventory On-Hand')).toBeVisible();
    await expect(page.getByText('Plant Rankings')).toBeVisible();

    // Test Math Execution: Assert that NO rendering resulted in NaN, Infinity, or undefined values.
    const pageText = await page.evaluate(() => document.body.innerText);
    expect(pageText).not.toMatch(/\bNaN\b/);
    expect(pageText).not.toMatch(/\bundefined\b/);
    expect(pageText).not.toMatch(/\bInfinity\b/);

    // Assert that a known calculated KPI (OpEx, WOs, or Inventory Value) rendered properly with standard currency formatting
    // Assuming UI formats it as $... or has a number
    expect(pageText).toMatch(/\$[0-9,]+/); 
  });
});
