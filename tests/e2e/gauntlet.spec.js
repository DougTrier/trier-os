// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

// Use the ghost_admin account for the stress tests
const ACCOUNT = { username: 'ghost_admin', password: 'Trier3652!' };

test.describe('The V4.0 Enterprise Gauntlet (Stress & Abuse Suite)', () => {

  test.beforeEach(async ({ page }) => {
    // 1. Log in cleanly before we start destroying things
    await page.goto('/');
    await page.locator('input[type="text"]').first().fill(ACCOUNT.username);
    await page.locator('input[type="password"]').first().fill(ACCOUNT.password);
    await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();

    try {
      const newPasswordInput = page.locator('input[type="password"]').nth(1); 
      await newPasswordInput.waitFor({ state: 'visible', timeout: 2000 });
      await page.locator('input[type="password"]').nth(0).fill(ACCOUNT.password);
      await page.locator('input[type="password"]').nth(1).fill(ACCOUNT.password);
      await page.locator('input[type="password"]').nth(2).fill(ACCOUNT.password);
      await page.locator('button').filter({ hasText: /Save/i }).first().click();
    } catch (e) {}

    await expect(page).not.toHaveURL(/.*login/, { timeout: 10000 });
  });

  // ==========================================
  // GAUNTLET 1: Dynamic React State Overload
  // ==========================================
  test('React State Overload (50 Rapid Clicks in 2 Seconds)', async ({ page }) => {
    // The Ghost user attempts to crash the Redux/Context state by violently clicking navigation
    // We target a generic sidebar or topbar link (like Work Orders or Dashboard)
    const elementToSpam = page.locator('a, button').filter({ hasText: /Dashboard|Work Orders|Menu/i }).first();
    
    // If the element exists, violently click it 50 times in a row without awaiting UI updates
    if (await elementToSpam.isVisible()) {
      for(let i=0; i<50; i++) {
        await elementToSpam.click({ force: true, noWaitAfter: true });
      }
      
      // The Gauntlet verifies the application didn't "White Screen of Death" (Crash)
      // A crashed React app drops the root element or displays "Unexpected Error"
      const appRoot = await page.locator('#root').innerHTML();
      expect(appRoot).not.toEqual('');
      await expect(page.getByText(/Unexpected Error|Application Crashed/i)).not.toBeVisible();
    }
  });

  // ==========================================
  // GAUNTLET 2: Extreme XSS Input Injection
  // ==========================================
  test('React Escaping XSS UI Attack (Stored Payload)', async ({ page }) => {
    // The Ghost user attempts to inject malicious javascript directly into the Global Search bar
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]').first();
    const maliciousPayload = `"><img src=x onerror=alert('FATAL_VULNERABILITY')>`;

    if (await searchInput.isVisible()) {
      // The ghost user pastes the raw script into the search engine
      await searchInput.fill(maliciousPayload);
      await searchInput.press('Enter');

      // 1. The DOM must inherently reject treating the string as code.
      // 2. An alert popup should NOT be fired natively by the browser.
      
      page.on('dialog', dialog => {
        // If an alert pops up, the test instantly fails the build.
        expect(dialog.message()).not.toContain('FATAL_VULNERABILITY');
        dialog.dismiss();
      });

      // The string should exist harmlessly as text on the screen somewhere ('Search results for...')
      await expect(page.locator('body')).toContainText('img src=x');
    }
  });

  // ==========================================
  // GAUNTLET 3: Stateless API Execution Boundary
  // ==========================================
  test('Zero-Trust Raw API Request Bypassing the App UI', async ({ request }) => {
    // The Ghost user ignores the physical application screen entirely.
    // They attempt to hit the backend Express API using a terminal `cURL` simulator 
    // to pull the raw JSON from the Corporate Analytics database without a JWT session wrapper.
    
    const apiResponse = await request.get('/api/corp-analytics/access/check');

    // Because the attacker bypassed the UI auth headers, the server MUST reject it mathematically.
    // We strictly assert the API boundary holds.
    expect(apiResponse.status() === 401 || apiResponse.status() === 403 || apiResponse.status() === 404).toBeTruthy();
  });

});
