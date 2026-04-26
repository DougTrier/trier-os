// Copyright © 2026 Trier OS. All Rights Reserved.

import { defineConfig, devices } from '@playwright/test';

/** Paths to pre-authenticated storageState files created by global-setup.js */
export const AUTH = {
  ghost_tech:  'tests/e2e/.auth/ghost_tech.json',
  ghost_admin: 'tests/e2e/.auth/ghost_admin.json',
  ghost_exec:  'tests/e2e/.auth/ghost_exec.json',
};

// Mobile Chrome (Zebra TC77) shared device settings.
// Split into 6 batches (~68–74 tests each) to avoid server connection exhaustion that
// causes cascading 19s timeouts after 90+ mobile tests in a single project.
//
// Run all mobile batches:  npx playwright test --project="Mobile Chrome"
// Run a single batch:      npx playwright test --project="Mobile Chrome — Batch 1"
//
// Excluded from all mobile batches:
//   master-workflow   — desktop-only grid layout; heading hidden at 360px viewport
//   offline-lan-sync  — routeWebSocket() incompatible with isMobile emulation context
//   scanner-hardware  — tests desktop scan state machine internals; mobile scanner covered by dual-mode + flaky-suspects S7
const MOBILE_TC77 = {
  ...devices['Pixel 5'],
  viewport: { width: 360, height: 800 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
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
    baseURL: 'https://localhost:1938',
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

    // ── Mobile Chrome batches ─────────────────────────────────────────────────

    {
      // ~64 tests: gatekeeper suite, RBAC, auth, misc small specs
      name: 'Mobile Chrome — Batch 1 / Security',
      use: { ...MOBILE_TC77 },
      testMatch: [
        '**/gatekeeper-g2.spec.js',
        '**/gatekeeper-g3.spec.js',
        '**/gatekeeper-g6.spec.js',
        '**/gatekeeper-g7.spec.js',
        '**/gatekeeper-g8.spec.js',
        '**/rbac.spec.js',
        '**/operator-trust.spec.js',
        '**/login.spec.js',
        '**/accessibility.spec.js',
        '**/saas.spec.js',
        '**/metrics-calculations.spec.js',
        '**/map-vetting.spec.js',
        '**/sop-acknowledgment.spec.js',
        '**/spare-parts-optimization.spec.js',
        '**/vendor-scorecard.spec.js',
        '**/shift-handover.spec.js',
      ],
    },
    {
      // ~71 tests: UI/UX, smoke, catalog & integration API specs
      name: 'Mobile Chrome — Batch 2 / UX & Smoke',
      use: { ...MOBILE_TC77 },
      testMatch: [
        '**/dual-mode.spec.js',
        '**/gauntlet.spec.js',
        '**/flaky-suspects.spec.js',
        '**/asset-lifecycle.spec.js',
        '**/catalog-cross-ref.spec.js',
        '**/dt-sync.spec.js',
        '**/edge-mesh.spec.js',
      ],
    },
    {
      // ~70 tests: data pipeline, invariants, scan & QA operations
      name: 'Mobile Chrome — Batch 3 / Data & Scan',
      use: { ...MOBILE_TC77 },
      testMatch: [
        '**/emissions.spec.js',
        '**/explain-cache.spec.js',
        '**/invariants.spec.js',
        '**/scan-to-segment.spec.js',
        '**/qa-scan.spec.js',
        '**/qa-maintenance.spec.js',
        '**/scan-parts-workflow.spec.js',
      ],
    },
    {
      // ~74 tests: full QA compliance suite
      name: 'Mobile Chrome — Batch 4 / QA Suite',
      use: { ...MOBILE_TC77 },
      testMatch: [
        '**/qa-advanced.spec.js',
        '**/qa-corporate.spec.js',
        '**/qa-quality.spec.js',
        '**/qa-safety.spec.js',
      ],
    },
    {
      // ~68 tests: stress-test sections 00 (RBAC Gauntlet, 63 tests) + 01 (Auth & Header, 5 tests)
      name: 'Mobile Chrome — Batch 5 / Stress-A',
      use: { ...MOBILE_TC77 },
      testMatch: ['**/stress-test.spec.js'],
      grep: /\b0[01] ·/,
    },
    {
      // ~70 tests: stress-test sections 02–20 (Portal smoke, Mission Control, API health, etc.)
      name: 'Mobile Chrome — Batch 6 / Stress-B',
      use: { ...MOBILE_TC77 },
      testMatch: ['**/stress-test.spec.js'],
      grep: /\b0[2-9] ·|\b1[0-9] ·|\b20 ·/,
    },
  ],
});
