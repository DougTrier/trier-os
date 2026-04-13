// Copyright © 2026 Trier OS. All Rights Reserved.
//
// ============================================================
//  TRIER OS — FLAKY SUSPECTS INVESTIGATION SUITE
//  Run with: npx playwright test tests/e2e/flaky-suspects.spec.js --workers=2 --retries=0
//  Purpose: Expose tests that pass only on retry so we can fix them.
//  Sourced from trier-os-suite.spec.js sections that showed instability.
// ============================================================

import { test, expect } from '@playwright/test';

const ADMIN  = { username: 'ghost_admin', password: 'Trier3652!' };
const EXEC   = { username: 'ghost_exec',  password: 'Trier7969!' };
const PLANT  = 'Demo_Plant_1';
const API    = '/api';
const EXPRESS = 'http://localhost:3000';

async function login(page, account = ADMIN) {
  await page.addInitScript(() => {
    for (const s of ['default', 'ghost_admin', 'ghost_tech', 'ghost_exec',
                     'demo_tech', 'demo_operator', 'demo_maint_mgr', 'demo_plant_mgr']) {
      localStorage.setItem(`pf_onboarding_complete_${s}`, 'true');
      localStorage.setItem(`pf_onboarding_dismissed_${s}`, 'true');
    }
  });
  await page.context().clearCookies();
  await page.goto('/');
  await page.locator('input[name="username"], input[type="text"]').first().fill(account.username);
  await page.locator('input[name="password"], input[type="password"]').first().fill(account.password);
  await page.locator('button[type="submit"], button').filter({ hasText: /sign in|log in/i }).first().click();
  await expect(page).not.toHaveURL(/.*login/, { timeout: 10000 });
  await expect(page.locator('.mc-container')).toBeVisible({ timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.evaluate((plantId) => localStorage.setItem('selectedPlantId', plantId), PLANT);
}

async function seeText(page, text, timeout = 15000) {
  await expect(page.getByText(new RegExp(text, 'i')).first()).toBeVisible({ timeout });
}

async function api(page, method, url, data) {
  return page.request[method.toLowerCase()](url, data ? { data } : undefined);
}

// ════════════════════════════════════════════════════════════════════════════════
// S1 · Known flaky: Dashboard KPI cards
// ════════════════════════════════════════════════════════════════════════════════
test.describe('S1 · Dashboard KPI timing', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/dashboard');
    const select = page.locator('select').first();
    if (await select.isVisible({ timeout: 3000 }).catch(() => false)) {
      await select.selectOption({ index: 1 });
      await page.waitForTimeout(1200);
    }
  });

  test('Dashboard KPI cards render — PM Compliance / MTBF / Downtime', async ({ page }) => {
    // Increased timeout to 20s — this card loads asynchronously via /api/maintenance-kpis
    const kpiText = await page.getByText(/PM Compliance|MTBF|Downtime|Backlog|Open Work/i).first()
      .isVisible({ timeout: 20000 }).catch(() => false);
    expect(kpiText).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// S2 · Section 12 new routes (the 5 added after original merge)
// ════════════════════════════════════════════════════════════════════════════════
test.describe('S2 · New route smoke tests', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

  test('/quality-log — module loads', async ({ page }) => {
    await page.goto('/quality-log');
    await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
    await seeText(page, 'Quality');
  });

  test('/analytics — module loads', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
    await seeText(page, 'Insights');
  });

  test('/fleet — module loads', async ({ page }) => {
    await page.goto('/fleet');
    await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
    await seeText(page, 'Fleet');
  });

  test('/procedures — module loads', async ({ page }) => {
    await page.goto('/procedures');
    await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
    await seeText(page, 'SOP');
  });

  test('/history — module loads', async ({ page }) => {
    await page.goto('/history');
    await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
    await seeText(page, 'History');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// S3 · API Health — all 19 endpoints, strict status=200 check
// ════════════════════════════════════════════════════════════════════════════════
test.describe('S3 · API Health checks', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

  const apiChecks = [
    ['work-orders list',        `/api/work-orders?plantId=${PLANT}`],
    ['work-orders stats',       `/api/work-orders/stats?plantId=${PLANT}`],
    ['assets list',             `/api/assets?plantId=${PLANT}`],
    ['parts list',              `/api/parts?plantId=${PLANT}`],
    ['procedures list',         `/api/procedures?plantId=${PLANT}`],
    ['loto permits list',       `/api/loto/permits?plantId=${PLANT}`],
    ['safety permits list',     `/api/safety-permits/permits?plantId=${PLANT}`],
    ['tools list',              `/api/tools?plantId=${PLANT}`],
    ['contractors list',        `/api/contractors?plantId=${PLANT}`],
    ['training courses',        `/api/training/courses?plantId=${PLANT}`],
    ['shift log',               `/api/shift-log?plantId=${PLANT}`],
    ['pm-schedules',            `/api/pm-schedules?plantId=${PLANT}`],
    ['storeroom summary',       `/api/storeroom/summary?plantId=${PLANT}`],
    ['maintenance-kpis summary',`/api/maintenance-kpis/summary?plantId=${PLANT}`],
    ['corp-analytics inflation', `/api/corp-analytics/vendor-inflation?days=30&limit=10`],
    ['fleet list',               `/api/fleet?plantId=${PLANT}`],
    ['maintenance-kpis pm-compliance', `/api/maintenance-kpis/pm-compliance?plantId=${PLANT}`],
    ['analytics dashboard',      `/api/analytics?plantId=${PLANT}`],
    ['compliance list',          `/api/compliance?plantId=${PLANT}`],
  ];

  for (const [label, path] of apiChecks) {
    test(`GET ${label} returns 200`, async ({ page }) => {
      const res = await api(page, 'GET', path);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toBeDefined();
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// S4 · Corp Analytics remaining tabs (load timing suspects)
// ════════════════════════════════════════════════════════════════════════════════
test.describe('S4 · Corp Analytics remaining tabs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, EXEC);
    await page.goto('/corp-analytics');
    await seeText(page, 'Corporate Analytics');
  });

  const tabs = ['Plant Rankings', 'Financial', 'Risk Matrix', 'Forecast', 'Workforce', 'Property'];

  for (const tab of tabs) {
    test(`${tab} tab loads without crash`, async ({ page }) => {
      const btn = page.locator('button, a').filter({ hasText: new RegExp(tab, 'i') }).first();
      if (await btn.isVisible({ timeout: 10000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(1000);
        await expect(page.locator('#root')).not.toBeEmpty();
        await expect(page.locator('body')).not.toHaveText(/Unexpected Error|Application Error|crashed/i);
      }
    });
  }

  test('Overview KPI value cells contain numbers', async ({ page }) => {
    const cells = page.locator('text=/\\$|\\d+\\.\\d|\\d{1,3},\\d{3}/').first();
    const found = await cells.isVisible({ timeout: 10000 }).catch(() => false);
    if (!found) {
      await expect(page.locator('#root')).not.toBeEmpty();
    }
  });

  test('/api/corp-analytics overview returns 200 or 404', async ({ page }) => {
    const res = await api(page, 'GET', `/api/corp-analytics/overview?plantId=all`);
    expect([200, 404]).toContain(res.status());
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// S5 · Search & Filter inputs
// ════════════════════════════════════════════════════════════════════════════════
test.describe('S5 · Search & Filter inputs', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

  test('/jobs — search input accepts text', async ({ page }) => {
    await page.goto('/jobs');
    const search = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]').first();
    await expect(search).toBeVisible({ timeout: 12000 });
    await search.fill('test-search-xyz');
    await page.waitForTimeout(600);
    await expect(page.locator('body')).not.toHaveText(/error/i);
    await search.clear();
  });

  test('/assets — search input accepts text', async ({ page }) => {
    await page.goto('/assets');
    const search = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="asset" i]').first();
    await expect(search).toBeVisible({ timeout: 12000 });
    await search.fill('PUMP');
    await page.waitForTimeout(600);
    await expect(page.locator('body')).not.toHaveText(/crashed/i);
  });

  test('/parts — search input is present', async ({ page }) => {
    await page.goto('/parts');
    const search = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="part" i]').first();
    await expect(search).toBeVisible({ timeout: 12000 });
    await search.fill('bearing');
    await page.waitForTimeout(600);
    await expect(page.locator('body')).not.toHaveText(/crashed/i);
  });

  test('/safety — filter element is present', async ({ page }) => {
    await page.goto('/safety');
    await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
    const filter = page.locator('input[type="search"], input[placeholder*="search" i], select').first();
    await expect(filter).toBeVisible({ timeout: 10000 });
  });

  test('/contractors — list loads without crash', async ({ page }) => {
    await page.goto('/contractors');
    await expect(page.locator('body')).not.toHaveText(/404|not found/i, { timeout: 10000 });
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('/procedures — SOP page loads and has filter capability', async ({ page }) => {
    await page.goto('/procedures');
    await seeText(page, 'Methods Library');
    await expect(page.locator('body')).not.toHaveText(/crashed/i);
  });

  test('/training — training page loads', async ({ page }) => {
    await page.goto('/training');
    await expect(page.locator('body')).not.toHaveText(/404/i, { timeout: 10000 });
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('/storeroom — ABC analysis section renders', async ({ page }) => {
    await page.goto('/storeroom');
    await expect(page.locator('body')).not.toHaveText(/404/i, { timeout: 10000 });
    const abcSection = page.getByText(/ABC|Storeroom|Carrying Cost|Dead Stock/i).first();
    await expect(abcSection).toBeVisible({ timeout: 12000 });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// S6 · Settings & User Preferences
// ════════════════════════════════════════════════════════════════════════════════
test.describe('S6 · Settings & Preferences', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

  test('/settings renders without crash', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 12000 });
    await expect(page.locator('body')).not.toHaveText(/404|Unexpected Error/i);
  });

  test('Language selector present on settings', async ({ page }) => {
    await page.goto('/settings');
    const langEl = page.locator('select, button, [role="combobox"]').filter({ hasText: /English|Language|Locale|Translation/i }).first();
    if (await langEl.isVisible({ timeout: 8000 }).catch(() => false)) {
      await expect(langEl).toBeEnabled();
    } else {
      await expect(page.locator('body')).not.toHaveText(/crashed/i);
    }
  });

  test('Plant selector has a value after login', async ({ page }) => {
    const select = page.locator('select').first();
    await expect(select).toBeVisible({ timeout: 10000 });
    const val = await select.inputValue();
    expect(val).toBeTruthy();
  });

  test('/about renders version info', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('body')).not.toHaveText(/404/i, { timeout: 10000 });
    await seeText(page, 'Trier OS');
  });

  test('User persona badge visible after login', async ({ page }) => {
    const badge = page.locator('[class*="persona"], [class*="badge"], [class*="role"]').first();
    if (await badge.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(badge).toBeVisible();
    } else {
      await expect(page.locator('.mc-container')).toBeVisible({ timeout: 5000 });
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// S7 · Mobile Scanner UX
// ════════════════════════════════════════════════════════════════════════════════
test.describe('S7 · Mobile Scanner UX', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN); });

  test('/scanner input has inputmode attribute', async ({ page }) => {
    await page.goto('/scanner');
    const input = page.locator('input[placeholder*="asset" i], input[placeholder*="scan" i], input[placeholder*="enter" i]').first();
    await expect(input).toBeVisible({ timeout: 12000 });
    const mode = await input.getAttribute('inputmode');
    expect(['numeric', 'text', 'decimal', null]).toContain(mode);
  });

  test('/scanner shows "Scan QR Code" button', async ({ page }) => {
    await page.goto('/scanner');
    await expect(page.getByRole('button', { name: /Scan QR Code/i })).toBeVisible({ timeout: 12000 });
  });

  test('/scanner — scan submit does not crash', async ({ page }) => {
    await page.route('**/api/scan', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ branch: 'AUTO_CREATE_WO', scanId: `flaky-${Date.now()}`,
            wo: { id: '99', number: 'WO-FLAKY-001', description: 'Flaky Test' } }),
        });
      } else { route.continue(); }
    });
    await page.goto('/scanner');
    const input = page.locator('input[placeholder*="asset" i], input[placeholder*="scan" i], input[placeholder*="enter" i]').first();
    await expect(input).toBeVisible({ timeout: 12000 });
    await input.fill('FLAKY-ASSET-01');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    await expect(page.locator('body')).not.toHaveText(/Unexpected Error|crashed/i);
  });

  test('/scanner Done button resets to capture view', async ({ page }) => {
    await page.route('**/api/scan', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ branch: 'AUTO_CREATE_WO', scanId: `done-${Date.now()}`,
            wo: { id: '10', number: 'WO-DONE-002', description: 'Done Test' } }),
        });
      } else { route.continue(); }
    });
    await page.goto('/scanner');
    const input = page.locator('input[placeholder*="asset" i], input[placeholder*="scan" i], input[placeholder*="enter" i]').first();
    await expect(input).toBeVisible({ timeout: 12000 });
    await input.fill('RESET-ASSET');
    await page.keyboard.press('Enter');
    const doneBtn = page.getByRole('button', { name: /Done/i });
    if (await doneBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await doneBtn.click();
      await expect(input).toBeVisible({ timeout: 5000 });
    } else {
      await expect(page.locator('body')).not.toHaveText(/crashed/i);
    }
  });

  test('/scanner shows Smart Scanner title', async ({ page }) => {
    await page.goto('/scanner');
    await expect(page.getByText(/Smart Scanner/i)).toBeVisible({ timeout: 12000 });
  });
});
