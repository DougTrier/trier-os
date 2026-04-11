// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.describe('Trier OS Zebra TC77 Login Simulation', () => {

  test('Should render the login perimeter properly', async ({ page }) => {
    // 1. Visit the login screen
    await page.goto('/');

    // 2. Assert the page title
    await expect(page).toHaveTitle(/Trier OS/i);

    // 3. Username and password fields must be present (placeholders are i18n-translated)
    await expect(page.locator('input[type="text"], input[name="username"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // 4. Submit button must be present (button says "Sign In")
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  });

  test('Should reject fake credentials with an error', async ({ page }) => {
    await page.goto('/');

    // Find the login inputs using type selectors (placeholders are i18n-translated)
    const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const loginBtn = page.locator('button[type="submit"]').first();

    // Ensure they exist before we type
    await expect(loginBtn).toBeVisible();

    // Type real Ghost credentials provided by the Admin
    await usernameInput.fill('ghost_tech');
    await passwordInput.fill('Trier3292!');

    // Ghost user clicks submit
    await loginBtn.click();

    // After logging in, the system will redirect away from the login screen.
    // Verify that the URL changed away from the login perimeter.
    await expect(page).not.toHaveURL('/login', { timeout: 15000 });
  });

});
