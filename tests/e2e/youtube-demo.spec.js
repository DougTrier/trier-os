const { test, expect } = require('@playwright/test');

/**
 * Utility function to display a beautiful on-screen caption during the recording.
 * We inject a styled DOM element directly into the browser.
 */
async function showCaption(page, text, durationMs = 3000) {
  // Inject the caption element
  await page.evaluate((captionText) => {
    const el = document.createElement('div');
    el.id = 'demo-caption';
    el.innerText = captionText;
    
    // Styling it to look like a professional "Lower Third" presentation graphic
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '10%',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'rgba(15, 23, 42, 0.9)', // Deep slate backend
      color: '#ffffff',
      padding: '24px 48px',
      borderRadius: '12px',
      fontSize: '32px',
      fontWeight: 'bold',
      fontFamily: 'Inter, system-ui, sans-serif',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      zIndex: '999999',
      opacity: '0',
      transition: 'opacity 0.5s ease-in-out',
      textAlign: 'center',
      maxWidth: '80%'
    });
    
    document.body.appendChild(el);
    
    // Fade in
    setTimeout(() => { el.style.opacity = '1'; }, 50);
  }, text);

  // Wait for the duration people need to read the text
  await page.waitForTimeout(durationMs);

  // Fade out and remove
  await page.evaluate(() => {
    const el = document.getElementById('demo-caption');
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }
  });
  
  // A small pause after the caption disappears
  await page.waitForTimeout(500);
}

test('Trier OS YouTube Promo Reel', async ({ browser }) => {
  test.setTimeout(120000); // 2 minutes for a slow presentation
  // We create a custom context to ensure we record video smoothly
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: 'videos/promo/',
      size: { width: 1920, height: 1080 },
    }
  });

  const page = await context.newPage();

  // ----- 1. Start up and Login -----
  await page.goto('https://localhost:5173/'); // Adjust to your actual dev server port
  
  await showCaption(page, 'Welcome to Trier OS (Open Source Release)', 4000);
  
  // Actually Login based on login.spec.js
  const usernameInput = page.getByPlaceholder('Username');
  const passwordInput = page.getByPlaceholder('Password');
  const loginBtn = page.getByRole('button', { name: 'Log In' });

  // Ensure they exist before we type
  await expect(loginBtn).toBeVisible();

  // Type real Ghost credentials provided by the Admin
  await usernameInput.fill('ghost_tech');
  await passwordInput.fill('Trier3292!');

  // Ghost user clicks "Log In"
  await loginBtn.click();

  // ----- 2. Wait for Dashboard to load -----
  // Linger on the dashboard for a moment
  await showCaption(page, 'Centralized Dashboard for Global Maintenance Operations', 4000);
  await page.waitForTimeout(2000); 

  // ----- 3. Navigate to Maps/GIS Mode -----
  // We'll just look for a map element or navigating button
  const mapBtn = page.getByText(/map|geospatial/i);
  if (await mapBtn.isVisible()) {
      await mapBtn.click();
  }
  await showCaption(page, 'Real-time Geospatial Plant & Asset Intelligence', 4500);
  await page.waitForTimeout(3000); 

  // ----- 4. Wrap up -----
  await showCaption(page, 'Trier OS 3.3.0. Built for the Enterprise.', 5000);

  // Closing the context automatically saves the video file
  await context.close();
});
