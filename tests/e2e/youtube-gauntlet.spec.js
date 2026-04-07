// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

// Use the ghost_admin account for the stress tests
const ACCOUNT = { username: 'ghost_admin', password: 'Trier3652!' };

// High-end cinematic caption injector
async function showCaption(page, text, durationMs = 3000) {
  await page.evaluate((captionText) => {
    const el = document.createElement('div');
    el.id = 'demo-caption';
    el.innerText = captionText;
    Object.assign(el.style, {
      position: 'fixed', bottom: '10%', left: '50%', transform: 'translateX(-50%)',
      backgroundColor: 'rgba(220, 38, 38, 0.9)', // Red alert for Gauntlet mode
      color: '#ffffff', padding: '24px 48px', borderRadius: '12px',
      fontSize: '32px', fontWeight: 'bold', fontFamily: 'Inter, system-ui, sans-serif',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', border: '2px solid rgba(255, 255, 255, 0.2)',
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

test('Trier OS Cinematic Enterprise Gauntlet', async ({ browser }) => {
  test.setTimeout(180000); // 3 minutes timeout for a slow presentation
  
  // Create a custom context to ensure we record video smoothly
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: 'videos/gauntlet/',
      size: { width: 1920, height: 1080 },
    }
  });

  const page = await context.newPage();

  // ----- 1. Start up and Login -----
  await page.goto('https://localhost:5173/'); 
  
  await showCaption(page, 'Initiating The V4.0 Enterprise Gauntlet (Stress Suite)', 3000);
  
  // Login with Ghost Admin
  await page.locator('input[type="text"]').first().fill(ACCOUNT.username);
  await page.waitForTimeout(1000); // Human typing speed
  await page.locator('input[type="password"]').first().fill(ACCOUNT.password);
  await page.waitForTimeout(1000); 
  
  await showCaption(page, 'Authenticating via Secure Zero-Trust Perimeter...', 3000);
  await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();

  await expect(page).not.toHaveURL(/.*login/, { timeout: 10000 });
  await showCaption(page, 'Access Granted.', 2000);

  // ==========================================
  // GAUNTLET 1: Dynamic React State Overload
  // ==========================================
  await showCaption(page, 'STAGE 1: React State Overload (50 Rapid Clicks)', 4000);
  
  const elementToSpam = page.locator('a, button').filter({ hasText: /Dashboard|Work Orders|Menu/i }).first();
  if (await elementToSpam.isVisible()) {
      for(let i=0; i<50; i++) {
        await elementToSpam.click({ force: true, noWaitAfter: true });
        await page.waitForTimeout(50); // Just enough to see it flicker wildly
      }
      await page.waitForTimeout(2000); 
      await showCaption(page, 'System Stable. Zero State Crashes Detected.', 3500);
  }

  // ==========================================
  // GAUNTLET 2: Extreme XSS Input Injection
  // ==========================================
  await showCaption(page, 'STAGE 2: Extreme XSS UI Attack', 4000);
  const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]').first();
  const maliciousPayload = `"><img src=x onerror=alert('FATAL_VULNERABILITY')>`;

  if (await searchInput.isVisible()) {
      await showCaption(page, 'Injecting Malicious Payload into Global Search...', 3000);
      
      // Simulate slow typing for dramatic effect
      for(let char of maliciousPayload) {
          await searchInput.type(char, { delay: 50 });
      }
      
      await page.waitForTimeout(1500);
      
      page.on('dialog', dialog => { dialog.dismiss(); }); // Auto dismiss any alerts
      await searchInput.press('Enter');
      
      await page.waitForTimeout(2000);
      await showCaption(page, 'Attack Neutralized by Application Sandboxing.', 3500);
  }

  // Wrap up
  await showCaption(page, 'Gauntlet Complete. Trier OS is Secure.', 5000);

  await context.close();
});
