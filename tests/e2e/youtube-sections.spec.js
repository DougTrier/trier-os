// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

// Use ghost_admin to ensure we have God-mode access across all modules
const ACCOUNT = { username: 'ghost_admin', password: 'Trier3652!' };

async function showCaption(page, text, durationMs = 3000) {
  await page.evaluate((captionText) => {
    const el = document.createElement('div');
    el.id = 'demo-caption';
    el.innerText = captionText;
    Object.assign(el.style, {
      position: 'fixed', bottom: '10%', left: '50%', transform: 'translateX(-50%)',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      color: '#ffffff', padding: '24px 48px', borderRadius: '12px',
      fontSize: '32px', fontWeight: 'bold', fontFamily: 'Inter, system-ui, sans-serif',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', border: '2px solid rgba(255, 255, 255, 0.1)',
      zIndex: '999999', opacity: '0', transition: 'opacity 0.5s ease-in-out',
      textAlign: 'center', maxWidth: '80%'
    });
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '1'; }, 50);
  }, text);

  await page.waitForTimeout(durationMs);

  await page.evaluate(() => {
    const el = document.getElementById('demo-caption');
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }
  });
  await page.waitForTimeout(500);
}

// Reusable login that forcefully suppresses the UI onboarding
async function prepareContext(page) {
    await page.goto('/'); 
    await page.waitForTimeout(500);
    
    await page.evaluate(() => {
        localStorage.setItem('pf_onboarding_dismissed_ghost_admin', 'true');
        localStorage.setItem('pf_onboarding_complete_ghost_admin', 'true');
        localStorage.setItem('pf_onboarding_dismissed_default', 'true');
        localStorage.setItem('pf_onboarding_complete_default', 'true');
    });

    await page.locator('input[type="text"]').first().fill(ACCOUNT.username);
    await page.locator('input[type="password"]').first().fill(ACCOUNT.password);
    await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();

    await expect(page).not.toHaveURL(/.*login/, { timeout: 10000 });
    await page.waitForTimeout(1000);
}


test.describe('Module Feature Showcase', () => {

  test('Jobs & Work Orders', async ({ browser }) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ recordVideo: { dir: 'videos/sections/' }});
    const page = await context.newPage();
    await prepareContext(page);

    await page.goto('/jobs');
    await page.waitForTimeout(1500);
    await showCaption(page, 'Work Order Management Engine', 4000);
    
    // Simulate intent to create a WO
    const btn = page.locator('button').filter({ hasText: /new|add|create/i }).first();
    if (await btn.isVisible().catch(() => false)) await btn.click({ force: true });
    
    await page.waitForTimeout(1500);
    await showCaption(page, 'Assign parts, downtime, and labor instantly', 4500);
    await showCaption(page, 'Ensure accountability with mandatory shift sign-offs', 4000);
    
    await context.close();
  });

  test('SOP & Procedures Library', async ({ browser }) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ recordVideo: { dir: 'videos/sections/' }});
    const page = await context.newPage();
    await prepareContext(page);

    await page.goto('/procedures');
    await page.waitForTimeout(1500);
    await showCaption(page, 'Standard Operating Procedures Library', 4000);
    
    // Try to click an "AI Generate" type button
    const btn = page.locator('button').filter({ hasText: /AI|Generate/i }).first();
    if (await btn.isVisible().catch(() => false)) await btn.click({ force: true });

    await page.waitForTimeout(1500);
    await showCaption(page, 'Use AI to rapidly structure tribal knowledge into compliant protocols', 4500);
    await showCaption(page, 'Attach to assets to standardize global maintenance tactics', 4000);
    
    await context.close();
  });

  test('Corporate Analytics', async ({ browser }) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ recordVideo: { dir: 'videos/sections/' }});
    const page = await context.newPage();
    await prepareContext(page);

    await page.goto('/corp-analytics');
    await page.waitForTimeout(1500);
    await showCaption(page, 'Corporate Executive Analytics', 4000);
    
    // Switch to Financial Tab
    const tab = page.getByText(/Financial/i).first();
    if (await tab.isVisible().catch(() => false)) await tab.click({ force: true });
    
    await page.waitForTimeout(1500);
    await showCaption(page, 'Aggregate live operational cost data across all global plants', 4500);
    
    // Switch to Risk Tab
    const riskTab = page.getByText(/Risk/i).first();
    if (await riskTab.isVisible().catch(() => false)) await riskTab.click({ force: true });

    await page.waitForTimeout(1000);
    await showCaption(page, 'Isolate liability exposure and compliance failures from the boardroom', 4000);
    
    await context.close();
  });

  test('Fleet Management', async ({ browser }) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ recordVideo: { dir: 'videos/sections/' }});
    const page = await context.newPage();
    await prepareContext(page);

    await page.goto('/fleet');
    await page.waitForTimeout(1500);
    await showCaption(page, 'Integrated Fleet & Heavy Equipment Logistics', 4000);
    
    const tab = page.getByText(/DVIR|DOT/i).first();
    if (await tab.isVisible().catch(() => false)) await tab.click({ force: true });
    
    await page.waitForTimeout(1500);
    await showCaption(page, 'Track fuel, mileage, DOT certifications, and DVIR inspections', 4500);
    await showCaption(page, 'Fully unify moving assets alongside stationary plant infrastructure', 4000);
    
    await context.close();
  });

  test('Quality & Scrap Dashboard', async ({ browser }) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ recordVideo: { dir: 'videos/sections/' }});
    const page = await context.newPage();
    await prepareContext(page);

    await page.goto('/quality-log');
    await page.waitForTimeout(1500);
    await showCaption(page, 'Quality Control & Produce Loss Log', 4000);
    
    // Attempt to interact with Lab Results
    const labTab = page.getByText(/Lab Results/i).first();
    if (await labTab.isVisible().catch(() => false)) await labTab.click({ force: true });

    await page.waitForTimeout(1500);
    await showCaption(page, 'Record lab metrics and automatically correlate failures to shift equipment', 4500);
    await showCaption(page, 'Stop bleeding scrap costs through rigid deviation reporting', 4000);
    
    await context.close();
  });

});
