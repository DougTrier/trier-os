// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

// Define the three Ghost Accounts provided by the MDM Admin
const GHOST_ACCOUNTS = [
  { 
    username: 'ghost_tech', 
    password: 'Trier3292!', 
    roleTitle: 'Technician', 
    canAccessExecutive: false // Technicians should be blocked by ITRouteGuard
  },
  { 
    username: 'ghost_admin', 
    password: 'Trier3652!', 
    roleTitle: 'IT Admin', 
    canAccessExecutive: true // IT Admins have full access
  },
  { 
    username: 'ghost_exec', 
    password: 'Trier7969!', 
    roleTitle: 'Corporate Executive', 
    canAccessExecutive: true // Executives have full access
  }
];

test.describe('Trier OS Role-Based Access Control (RBAC) Verification', () => {

  // We loop through each account to test the identical logic against the three different roles
  for (const account of GHOST_ACCOUNTS) {
    
    test(`Verify ${account.roleTitle} (${account.username}) Login & Executive Permissions`, async ({ page }) => {
      // 1. Ghost User opens the Zebra Scanner App Login
      await page.goto('/');

      // 2. Locate the input fields using standard HTML semantics
      const usernameInput = page.locator('input[type="text"], input[name="username"], input[name="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      
      // Wait for the UI to load entirely
      await expect(passwordInput).toBeVisible();

      // 3. Ghost User types in their credentials securely
      await usernameInput.fill(account.username);
      await passwordInput.fill(account.password);

      // 4. Ghost User presses "Log In"
      // We look for any button containing "Log" or "Sign"
      const loginBtn = page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first();
      await loginBtn.click();

      // 5. Handle the "Temporary Password Change" Intercept
      // If the URL directs to a password reset, or a form appears asking for "New Password"
      try {
        const newPasswordInput = page.locator('input[type="password"]').nth(1); 
        // We give it a short 2-second timeout to see if the Reset screen appears
        await newPasswordInput.waitFor({ state: 'visible', timeout: 2000 });
        
        // If it DOES appear, Playwright fills out the reset with the exact same password so it doesn't break future tests
        await page.locator('input[type="password"]').nth(0).fill(account.password); // Current
        await page.locator('input[type="password"]').nth(1).fill(account.password); // New
        await page.locator('input[type="password"]').nth(2).fill(account.password); // Confirm
        
        const saveBtn = page.locator('button').filter({ hasText: /Save|Update|Change/i }).first();
        await saveBtn.click();
      } catch (e) {
        // The Temporary Password screen did NOT appear, so we just proceed normally!
      }

      // 6. Wait for the Dashboard to load (The URL changes from /login)
      await expect(page).not.toHaveURL(/.*login/, { timeout: 10000 });

      // ================================================================
      // 7. THE PENETRATION TEST: Attacking the ITRouteGuard Logic
      // ================================================================

      // The Ghost user actively attempts to bypass the Mission Control buttons by typing directly into the URL bar
      await page.goto('/corp-analytics');

      if (!account.canAccessExecutive) {
        // Because they are a Technician, we DEMAND that the system blocks them.
        // We look for the exact text we coded into ITRouteGuard
        await expect(page.getByText(/Executive Systems Restricted|Restricted|Access Denied/i)).toBeVisible();
      } else {
        // Because they are an IT Admin or Executive, we DEMAND the system allows them in.
        // We look for the Corporate Analytics header to prove the page loaded
        await expect(page.locator('h1, h2, div').filter({ hasText: /Corporate Analytics|Analytics/i }).first()).toBeVisible();
      }
    });

  } // End Loop

});
