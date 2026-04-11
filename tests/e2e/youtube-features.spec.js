// Copyright © 2026 Trier OS. All Rights Reserved.

import { test, expect } from '@playwright/test';

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

test('Trier OS Cinematic Feature Highlights', async ({ browser }) => {
  test.setTimeout(180000); // 3 minutes timeout for a slow presentation
  
  // Create a custom context to ensure we record video smoothly
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: 'videos/features/',
      size: { width: 1920, height: 1080 },
    }
  });

  const page = await context.newPage();

  // ----- 1. Start up and Login -----
  await page.goto('/'); 
  
  await showCaption(page, 'Trier OS 3.3.0 \nEnterprise-Grade Plant Operations Platform', 4000);
  
  await page.locator('input[type="text"]').first().fill(ACCOUNT.username);
  await page.locator('input[type="password"]').first().fill(ACCOUNT.password);
  await page.locator('button').filter({ hasText: /Log In|Login|Sign In/i }).first().click();

  await expect(page).not.toHaveURL(/.*login/, { timeout: 10000 });
  await page.waitForTimeout(1500);

  // ----- Handle the Onboarding Guide/Tour -----
  // The guide auto-pops after 1.5 seconds on the first load. We wait 2 seconds to be safe.
  await page.waitForTimeout(2000); 

  // Explain the guide
  await showCaption(page, 'Built-in interactive training guides help onboard new users instantly.', 4000);
  
  // Close it safely using native Playwright clicks so we don't crash React
  const skipTourBtn = page.getByText(/Skip Tour/i).first();
  if (await skipTourBtn.isVisible()) {
      await skipTourBtn.click({ force: true });
  } else {
      // If we can't find the button, click the dark backdrop to dismiss
      await page.mouse.click(15, 15);
  }
  
  await page.waitForTimeout(1000); // Give the tour time to cleanly animate away

  // ----- 2. Mission Control -----
  await showCaption(page, 'Centralized Mission Control for Global Plant Facilities', 4000);
  // Optional: Hover over a few tiles randomly to show interactivity
  await page.mouse.move(960, 540); // Move mouse roughly center screen

  // ----- 3. Corporate Analytics Dashboard -----
  await page.goto('/corp-analytics');
  await page.waitForTimeout(1000);
  await showCaption(page, 'High-Level Corporate Analytics & Executive Portals', 4500);
  // Scroll down a bit to show data
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(2000);

  // ----- 4. Assets & Machinery Registry -----
  await page.goto('/assets');
  await page.waitForTimeout(1000);
  await showCaption(page, 'Massive Asset Registries with AI Predictive Risk Models', 4500);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(2000);

  // ----- 5. SOP & AI Methods Library -----
  await page.goto('/procedures');
  await page.waitForTimeout(1000);
  await showCaption(page, 'SOP & Methods Library with Generative AI Structuring', 4500);
  await page.waitForTimeout(1500);

  // ----- 6. Safety & Underwriter Dashboards -----
  await page.goto('/underwriter');
  await page.waitForTimeout(1000);
  await showCaption(page, 'Built-in Underwriter Auditing and Compliance Lockdowns', 4500);

  // ----- 7. Interactive Manual & IDE -----
  await page.goto('/about?manual=true');
  await page.waitForTimeout(1500);
  await showCaption(page, 'Built-In Operations Manual Linked Directly to Source Code', 4500);
  
  // Click the very first "Go to Code" button in the manual sections
  const codeBtn = page.getByText(/Go to Code/i).first();
  if (await codeBtn.isVisible().catch(() => false)) {
    await codeBtn.click();
    await page.waitForTimeout(1500);
    await showCaption(page, 'Live Studio: Integrated Enterprise IDE for Zero-Downtime Hotfixes', 4500);
    // Optional: type something in the Monaco editor to show it's real? We'll just admire it.
    await page.waitForTimeout(2000);
  }

  // ----- Wrap up -----
  await page.goto('/');
  await showCaption(page, 'Available Now on GitHub.', 5000);

  await context.close();
});
