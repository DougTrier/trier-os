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

        // Click a pin to open editor — use evaluate to bypass viewport constraints
        // (leaflet markers can be at map positions outside the current viewport bounds)
        await mapPins.first().evaluate(el => el.click());
        console.log('Clicked first map pin');
        // Give the editor panel time to animate open
        await page.waitForTimeout(2000);

        // Check for Property Value label in the editor panel
        await expect(page.getByText('Est. Value', { exact: false }).first()).toBeVisible({ timeout: 15000 });
        console.log('Est Value is visible');
    });
});
