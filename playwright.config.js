// Copyright © 2026 Trier OS. All Rights Reserved.

import { defineConfig, devices } from '@playwright/test';

/** Paths to pre-authenticated storageState files created by global-setup.js */
export const AUTH = {
  ghost_tech:  'tests/e2e/.auth/ghost_tech.json',
  ghost_admin: 'tests/e2e/.auth/ghost_admin.json',
  ghost_exec:  'tests/e2e/.auth/ghost_exec.json',
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  timeout: 60000,
  expect: { timeout: 25000 },
  workers: 1,  // TASK-02: TokenVersion revocation means concurrent logins on the same account
              // invalidate each other's sessions. Serial execution prevents the race.
  globalSetup: './tests/e2e/global-setup.js',
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
    serviceWorkers: 'block',  // Prevent SW from intercepting page.evaluate fetch calls
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
      // master-workflow: desktop-only grid layout, heading hidden at 360px
      // offline-lan-sync: routeWebSocket() incompatible with isMobile emulation context
      // qa-inspection: API-focused suite, server exhaustion after 90+ mobile tests causes cascading timeouts
      // scanner-hardware: tests desktop scan state machine internals; mobile scanner covered by dual-mode + flaky-suspects S7
      testIgnore: ['**/master-workflow.spec.js', '**/offline-lan-sync.spec.js', '**/qa-inspection.spec.js', '**/scanner-hardware.spec.js'],
    },
  ],
});

