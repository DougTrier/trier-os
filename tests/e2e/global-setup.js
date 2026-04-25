// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Playwright Global Setup (CommonJS)
 * ================================================
 * Runs ONCE before the entire test suite. Logs in each Ghost Account and
 * saves the authenticated browser storageState (cookies + localStorage) to
 * disk. Individual specs then load the correct state via `use.storageState`
 * instead of performing a full login in every beforeEach — which was causing
 * session-invalidation on Mobile Chrome when Desktop Chrome ran first.
 *
 * Storage files are saved under tests/e2e/.auth/ and are git-ignored.
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://localhost:1938';

const GHOST_ACCOUNTS = [
  { username: 'ghost_tech',  password: 'Trier3292!', file: 'ghost_tech.json'  },
  { username: 'ghost_admin', password: 'Trier3652!', file: 'ghost_admin.json' },
  { username: 'ghost_exec',  password: 'Trier7969!', file: 'ghost_exec.json'  },
];

async function loginAndSave(browser, account, authDir) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page    = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // Fill credentials
  await page.locator('input[type="text"], input[name="username"]').first().fill(account.username);
  await page.locator('input[type="password"]').first().fill(account.password);
  await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();

  // Handle forced password-change modal if present
  try {
    const np = page.locator('input[type="password"]').nth(1);
    await np.waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('input[type="password"]').nth(0).fill(account.password);
    await page.locator('input[type="password"]').nth(1).fill(account.password);
    await page.locator('input[type="password"]').nth(2).fill(account.password);
    await page.locator('button').filter({ hasText: /Save|Update|Change/i }).first().click();
  } catch { /* no password-change screen — normal flow */ }

  // Wait until we've left the login page (up to 15s)
  try {
    await page.waitForURL(url => !url.pathname.includes('login'), { timeout: 15000 });
  } catch { /* already redirected or timed out — save whatever we have */ }

  const outPath = path.join(authDir, account.file);
  await context.storageState({ path: outPath });
  await context.close();
  console.log(`[global-setup] Saved auth state for ${account.username} → ${outPath}`);
}

module.exports = async function globalSetup() {
  const authDir = path.join(__dirname, '.auth');
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch({ ignoreDefaultArgs: ['--disable-extensions'] });

  for (const account of GHOST_ACCOUNTS) {
    try {
      await loginAndSave(browser, account, authDir);
    } catch (e) {
      console.warn(`[global-setup] Could not pre-auth ${account.username}:\n  ${e.stack || e.message}`);
    }
  }

  await browser.close();
};
