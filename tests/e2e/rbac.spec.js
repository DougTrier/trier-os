// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

// Define the three Ghost Accounts provided by the MDM Admin
const GHOST_ACCOUNTS = [
  { 
    username: 'ghost_tech', 
    password: 'Trier3292!', 
    roleTitle: 'Technician', 
    canAccessExecutive: false, // Technicians should be blocked by ITRouteGuard
    storageState: 'tests/e2e/.auth/ghost_tech.json',
  },
  { 
    username: 'ghost_admin', 
    password: 'Trier3652!', 
    roleTitle: 'IT Admin', 
    canAccessExecutive: true, // IT Admins have full access
    storageState: 'tests/e2e/.auth/ghost_admin.json',
  },
  { 
    username: 'ghost_exec', 
    password: 'Trier7969!', 
    roleTitle: 'Corporate Executive', 
    canAccessExecutive: true, // Executives have full access
    storageState: 'tests/e2e/.auth/ghost_exec.json',
  }
];

test.describe('Trier OS Role-Based Access Control (RBAC) Verification', () => {

  // We loop through each account to test the identical logic against the three different roles
  for (const account of GHOST_ACCOUNTS) {
    
    test(`Verify ${account.roleTitle} (${account.username}) Login & Executive Permissions`, async ({ browser }) => {
      // Each account gets its own isolated browser context loaded with the pre-authenticated
      // storageState from global-setup.js — no runtime login required, no TokenVersion bump.
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        storageState: account.storageState,
      });
      const page = await context.newPage();

      // ================================================================
      // THE PENETRATION TEST: Attacking the ITRouteGuard Logic
      // ================================================================

      // Navigate directly to the Executive Systems route
      await page.goto('/corp-analytics', { waitUntil: 'domcontentloaded' });

      // If stored auth didn't survive (shows login form), fall back to a fresh login.
      // This handles edge cases where the saved cookie is rejected in the test browser context.
      const onLoginPage = await page.locator('input[type="password"]').first().isVisible({ timeout: 4000 }).catch(() => false);
      if (onLoginPage) {
        await page.locator('input[type="text"]').first().fill(account.username);
        await page.locator('input[type="password"]').first().fill(account.password);
        await page.locator('button[type="submit"]').first().click();
        // Handle forced password-change screen (ghost accounts may trigger once)
        try {
          const newPass = page.locator('input[type="password"]').nth(1);
          await newPass.waitFor({ state: 'visible', timeout: 2500 });
          await page.locator('input[type="password"]').nth(0).fill(account.password);
          await page.locator('input[type="password"]').nth(1).fill(account.password);
          await page.locator('input[type="password"]').nth(2).fill(account.password);
          await page.locator('button').filter({ hasText: /Save|Update|Change/i }).first().click();
        } catch { /* no forced reset */ }
        await expect(page.locator('.mc-container')).toBeVisible({ timeout: 30000 });
        await page.goto('/corp-analytics', { waitUntil: 'domcontentloaded' });
      }

      // ITRouteGuard performs an async fetch to /api/corp-analytics/access/check.
      // We must wait for the spinner ("Authenticating clearance...") to disappear
      // before asserting the final restricted / allowed state.
      await page.waitForFunction(
        () => !document.body.innerText.includes('Authenticating clearance'),
        { timeout: 20000 }
      );

      if (!account.canAccessExecutive) {
        // Because they are a Technician, we DEMAND that the system blocks them.
        // We look for the exact text we coded into ITRouteGuard
        await expect(page.getByText(/Executive Systems Restricted|Restricted|Access Denied/i)).toBeVisible({ timeout: 10000 });
      } else {
        // Because they are an IT Admin or Executive, we DEMAND the system allows them in.
        // We look for the Corporate Analytics header to prove the page loaded
        await expect(page.locator('h1, h2, div').filter({ hasText: /Corporate Analytics|Analytics/i }).first()).toBeVisible({ timeout: 10000 });
      }

      await context.close();
    });

  } // End Loop

});

