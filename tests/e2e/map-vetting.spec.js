const { test, expect } = require('@playwright/test');

test.use({ ignoreHTTPSErrors: true });

test.describe('Corporate Analytics & Map Verification', () => {
    test.beforeEach(async ({ page }) => {
        // Authenticate using ghost credentials used in other suites
        await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('Got to page');
        
        await expect(page.getByPlaceholder('Username')).toBeVisible({ timeout: 15000 });
        console.log('Username field visible');

        await page.getByPlaceholder('Username').fill('ghost_tech');
        await page.getByPlaceholder('Password').fill('Trier3292!');
        await page.click('button[type="submit"]');
        
        // Wait 2 seconds for authentication cookie to be set and app to initialize
        await page.waitForTimeout(2000);
    });

    test('Verify Map Pins & Property Value rendering', async ({ page }) => {
        console.log('Going to /maps...');
        await page.goto('/maps', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(5000); // Give Cesium time

        const mapPins = page.locator('.leaflet-marker-icon');
        const count = await mapPins.count();
        console.log('Found map pins:', count);
        expect(count).toBeGreaterThan(0);

        // Click a pin to open editor
        await mapPins.first().click({ force: true });
        console.log('Clicked first map pin');

        // Check for Property Value
        await expect(page.locator('text="Est. Value"')).toBeVisible({ timeout: 10000 });
        console.log('Est Value is visible');
    });
});
