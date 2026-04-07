// Copyright © 2026 Trier OS. All Rights Reserved.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  timeout: 60000,
  expect: { timeout: 25000 },
  workers: 1,
  reporter: [
      ['html', { open: 'never', outputFolder: 'playwright-report' }],
      ['list'],
  ],
  use: {
    baseURL: 'https://localhost:5173',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // slowMo removed — was 500ms per action, causing timeouts on anything > 10 actions
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'Mobile Chrome (Zebra TC77)',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 800 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 3,
      },
      // Removed Desktop dependency — run independently so mobile doesn't wait on full desktop suite
    },
  ],
});
