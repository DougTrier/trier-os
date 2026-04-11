// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

// Use the ghost_admin account for the demo
const ACCOUNT = { username: 'ghost_admin', password: 'Trier3652!' };

// High-end cinematic caption injector
async function showCaption(page, text, durationMs = 3000) {
  await page.evaluate((captionText) => {
    const el = document.createElement('div');
    el.id = 'demo-caption';
    el.innerText = captionText;
    Object.assign(el.style, {
      position: 'fixed', bottom: '10%', left: '50%', transform: 'translateX(-50%)',
      backgroundColor: 'rgba(15, 23, 42, 0.95)', // Deep slate enterprise blue
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

// Global setup for bypassing onboarding and logging in
async function prepareContext(page) {
    await page.goto('/'); 
    await page.waitForTimeout(500);
    
    // Inject localStorage completions so the Joyride tour NEVER pops up
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


test.describe('Process Feature Tutorials', () => {

  test('How to Create an Asset', async ({ browser }) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ recordVideo: { dir: 'videos/tutorials/' }});
    const page = await context.newPage();
    await prepareContext(page);

    await page.goto('/assets');
    await page.waitForTimeout(1500);
    await showCaption(page, 'Step 1: Navigate to the Assets & Machinery Registry', 4000);
    
    const newAssetBtn = page.getByText(/New Asset|Add Asset/i).first();
    if (await newAssetBtn.isVisible().catch(() => false)) {
        await newAssetBtn.click({ force: true });
    }
    await page.waitForTimeout(1500);
    await showCaption(page, 'Step 2: Enter equipment specifications and details', 4500);
    await showCaption(page, 'Step 3: Save to deploy the asset enterprise-wide', 4000);
    
    await context.close();
  });

  test('How to Create a Part', async ({ browser }) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ recordVideo: { dir: 'videos/tutorials/' }});
    const page = await context.newPage();
    await prepareContext(page);

    await page.goto('/parts');
    await page.waitForTimeout(1500);
    await showCaption(page, 'Step 1: Open the Enterprise Parts Dashboard', 4000);
    
    const addPartBtn = page.locator('button').filter({ hasText: /Add Part|\+ New/i }).first();
    if (await addPartBtn.isVisible().catch(() => false)) {
        await addPartBtn.click({ force: true });
    }
    await page.waitForTimeout(1500);
    await showCaption(page, 'Step 2: Define min/max thresholds and supplier details', 4500);
    await showCaption(page, 'Step 3: Save Part for automatic vendor re-ordering', 4000);
    
    await context.close();
  });

  test('How to Execute a LOTO Procedure', async ({ browser }) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ recordVideo: { dir: 'videos/tutorials/' }});
    const page = await context.newPage();
    await prepareContext(page);

    await page.goto('/underwriter');
    await page.waitForTimeout(1500);
    await showCaption(page, 'Step 1: Access the Safety Compliance Modules', 4000);
    
    const lotoTab = page.getByText(/LOTO/i).first();
    if (await lotoTab.isVisible().catch(() => false)) {
        await lotoTab.click({ force: true });
    }
    await page.waitForTimeout(1500);
    await showCaption(page, 'Step 2: Generate a structured Lock-Out / Tag-Out procedure', 4500);
    await showCaption(page, 'Step 3: Require digital e-signatures for strict OSHA compliance', 4000);
    
    await context.close();
  });

});
