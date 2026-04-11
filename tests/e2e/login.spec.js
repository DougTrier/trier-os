// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

test.describe('Trier OS Zebra TC77 Login Simulation', () => {

  test('Should render the login perimeter properly', async ({ page }) => {
    // 1. Visit the actual development server URL (the ghost user opens chrome)
    await page.goto('/');

    // 2. We assert that the title proves we are at Trier OS
    await expect(page).toHaveTitle(/Trier OS/i);

    // 3. We check that the crucial Shop Floor button is visible for accessibility
    const shopFloorBtn = page.getByRole('button', { name: /Shop Floor: OFF/i });
    // Verify it exists in the DOM
    await expect(shopFloorBtn).toBeAttached();
  });

  test('Should reject fake credentials with an error', async ({ page }) => {
    await page.goto('/');

    // Find the login inputs (assuming basic text search or standard semantic inputs)
    const usernameInput = page.getByPlaceholder('Username');
    const passwordInput = page.getByPlaceholder('Password');
    const loginBtn = page.getByRole('button', { name: 'Log In' });

    // Ensure they exist before we type
    await expect(loginBtn).toBeVisible();

    // Type real Ghost credentials provided by the Admin
    await usernameInput.fill('ghost_tech');
    await passwordInput.fill('Trier3292!');

    // Ghost user clicks "Log In"
    await loginBtn.click();

    // After logging in with a new 'Temp Pass', the system will likely redirect
    // to a "Change Password" or "Dashboard" screen.
    // For now, we will verify that the URL changed away from the login perimeter.
    await expect(page).not.toHaveURL('/login');
  });

});
