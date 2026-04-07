// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Scanner & OCR Engine (Hardware & Camera)', () => {

  // Global Auth Setup for the Scanner
  test.beforeEach(async ({ page }) => {
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

  test('Zebra TC77 Hardware Wedge Simulator � fires hw-scan-inject correctly', async ({ page }) => {
    // Navigate to dashboard 
    await page.goto('/');

    // Select a plant to prevent "all_sites" generic lookups
    const plantSelect = page.locator('select').first();
    if (await plantSelect.isVisible({ timeout: 2000 })) {
      const val = await plantSelect.inputValue();
      if (!val || val === 'all_sites') {
        await plantSelect.selectOption('Demo_Plant_1');
        await page.waitForTimeout(1000);
      }
    }

    // Open scanner module reliably by looking for text or title and waiting
    const scannerBtn = page.locator('button:has-text("SCAN"), button[title*="Scan"]').first();
    await scannerBtn.waitFor({ state: 'visible', timeout: 10000 });
    await scannerBtn.click();
    
    // Wait for the scanner modal video or wrapper to attach
    await page.waitForSelector('#video-preview, .scanning-line', { timeout: 10000 });
    
    // SIMULATE ZEBRA HARDWARE WEDGE EVENT:
    // This mimics the split-second injection from the Zebra intent engine
    await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('hw-scan-inject', { detail: 'TEST-MOCK-HW-001' }));
    });

    // Verify the GlobalScanner successfully caught the hardware injection 
    await expect(page.getByText(/Unrecognized/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('TEST-MOCK-HW-001')).toBeVisible();
    await expect(page.getByText(/Register as new Part/i)).toBeVisible();
  });

  test('Mocked Camera Environment correctly falls back to OCR Photo Upload mode', async ({ context, page }) => {
    // Revoke camera permissions simulating typical HTTPS restricted environments or denied prompts
    await context.clearPermissions();
    await context.grantPermissions([], { origin: await page.evaluate(() => window.location.origin) });

    await page.goto('/');
    const scannerBtn = page.locator('button:has-text("SCAN"), button[title*="Scan"]').first();
    await scannerBtn.waitFor({ state: 'visible', timeout: 10000 });
    await scannerBtn.click();

    // Verify the system dynamically downgrades when hardware access is blocked in the secure context
    await expect(page.getByText(/Live Camera is blocked by your browser/i)).toBeVisible({ timeout: 15000 });
    
    // Verify the OCR/Photo upload button becomes available
    const uploadLabel = page.getByText(/Take Photo \/ Upload/i);
    await expect(uploadLabel).toBeVisible();
    
    // Verify the invisible file input exists inside the label
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
  });

});
