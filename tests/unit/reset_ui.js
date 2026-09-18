// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * Browser regression harness for the real reset and IT inventory components.
 * Called by database_reset.test.js --ui against its disposable authenticated API.
 * Vite transforms application source; Playwright clicks the UI without API mocks.
 */
module.exports = async function verifyUI({ app, origin, tokens, logistics, fixtureDir }) {
    const path = require('node:path');
    const { chromium, expect } = require('@playwright/test');
    const { createServer } = await import('vite');
    const { default: react } = await import('@vitejs/plugin-react');
    const vite = await createServer({ configFile: false, root: path.resolve(__dirname, '../..'),
        plugins: [react()], server: { middlewareMode: true }, appType: 'custom' });
    app.get('/__reset-ui', async (req, res) => {
        const html = `<!doctype html><html><head><title>Maintenance UI regression</title></head><body><div id="root"></div>
        <script type="module">
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {I18nProvider} from '/src/i18n/index.jsx';
        import PlantResetPanel from '/src/components/PlantResetPanel.jsx';
        import ITDepartmentView from '/src/components/ITDepartmentView.jsx';
        import '/src/index.css';
        function Harness() {
            const [plant, setPlant] = React.useState('Corporate_Office');
            return React.createElement('main', {style:{padding:24,minHeight:'100vh',background:'#0b1120',color:'#e2e8f0'}},
                location.search.includes('inventory') ? React.createElement(ITDepartmentView,{plantId:plant,plantLabel:'Corporate Office'}) :
                React.createElement(React.Fragment,null,
                    React.createElement('select',{'aria-label':'Database target',value:plant,onChange:e=>setPlant(e.target.value)},
                        ...['Corporate_Office','Plant_2','all_sites'].map(id=>React.createElement('option',{key:id,value:id},id))),
                    React.createElement(PlantResetPanel,{key:plant,currentPlant:{id:plant,label:plant}})));
        }
        createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(Harness)));
        </script></body></html>`;
        res.type('html').send(await vite.transformIndexHtml('/__reset-ui', html));
    });
    app.use(vite.middlewares);
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        await context.addInitScript(({ token }) => {
            localStorage.setItem('userRole', 'it_admin');
            localStorage.setItem('selectedPlantId', 'Corporate_Office');
            localStorage.setItem('PM_LANGUAGE', 'en');
            const original = window.fetch;
            window.fetch = (url, options = {}) => original(url, { ...options, headers: {
                Authorization: `Bearer ${token}`, 'x-plant-id': 'Corporate_Office', ...options.headers,
            } });
        }, { token: tokens.it_admin });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on('pageerror', error => { errors.push(error.message); console.warn('Browser error:', error.message); });
        page.on('console', message => { if (message.type() === 'error') console.warn('Browser console:', message.text()); });
        await page.goto(origin + '/__reset-ui');
        await page.getByRole('button', { name: 'Show reset options' }).click();
        await expect(page.getByLabel('Confirm selected plant')).toBeVisible();
        await page.getByLabel('Confirm selected plant').fill('Corporate Office');
        await page.getByLabel('Confirm permanent reset').fill('RESET-CONFIRMED');
        await expect(page.getByRole('button', { name: 'Execute reset' })).toBeEnabled();
        await page.getByLabel('Database target').selectOption('Plant_2');
        await page.getByRole('button', { name: 'Show reset options' }).click();
        await expect(page.getByLabel('Confirm selected plant')).toHaveValue('');
        await page.getByLabel('Confirm selected plant').fill('Corporate Office');
        await page.getByLabel('Confirm permanent reset').fill('RESET-CONFIRMED');
        await expect(page.getByRole('button', { name: 'Execute reset' })).toBeDisabled();
        await page.getByLabel('Confirm selected plant').fill('Plant 2');
        await page.screenshot({ path: path.join(fixtureDir, 'reset-preview.png'), fullPage: true });
        await page.getByRole('button', { name: 'Execute reset' }).click();
        await expect(page.getByText(/0 targeted records remain/)).toBeVisible();
        await page.getByLabel('Database target').selectOption('all_sites');
        await expect(page.getByRole('button', { name: 'Show reset options' })).toBeDisabled();

        logistics.prepare("INSERT INTO it_hardware (Name, PlantID) VALUES ('UI delete A', 'Corporate_Office'), ('UI delete B', 'Plant_2'), ('UI keep', 'Plant_2')").run();
        logistics.exec("CREATE TRIGGER BlockUIBulk BEFORE DELETE ON it_hardware WHEN OLD.Name = 'UI delete B' BEGIN SELECT RAISE(ABORT, 'injected UI failure'); END;");
        await page.goto(origin + '/__reset-ui?inventory');
        await page.getByRole('button', { name: 'Hardware', exact: true }).click();
        await page.getByPlaceholder('Search IT assets...').fill('UI delete');
        await page.getByLabel('Select all filtered assets').check();
        await page.getByRole('button', { name: 'Delete selected (2)' }).click();
        await expect(page.getByRole('dialog', { name: 'Confirm bulk deletion' })).toBeVisible();
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        assertCount(logistics, 2);
        await page.getByRole('button', { name: 'Delete selected (2)' }).click();
        await page.screenshot({ path: path.join(fixtureDir, 'bulk-delete-confirmation.png'), fullPage: true });
        await page.getByRole('button', { name: 'Permanently delete 2' }).click();
        await expect(page.getByText(/1 deleted\. 1 not deleted or unverified/)).toBeVisible();
        await expect(page.getByLabel('Select UI delete B', { exact: true })).toBeChecked();
        await expect(page.getByLabel('Select UI delete A', { exact: true })).toHaveCount(0);
        assertCount(logistics, 1);
        logistics.exec('DROP TRIGGER BlockUIBulk');
        await page.getByRole('button', { name: 'Delete selected (1)' }).click();
        await page.getByRole('button', { name: 'Permanently delete 1' }).click();
        await expect(page.getByText(/1 deleted\. 0 not deleted/)).toBeVisible();
        require('node:assert/strict').equal(logistics.prepare("SELECT COUNT(*) AS n FROM it_hardware WHERE Name = 'UI keep'").get().n, 1);
        // Exercise the legacy single-delete UI against an actual SQL failure.
        // A failed delete must retain both the row and its open edit form.
        await page.getByPlaceholder('Search IT assets...').fill('UI keep');
        await page.getByRole('row').filter({ hasText: 'UI keep' }).getByTitle('Edit', { exact: true }).click();
        logistics.exec("CREATE TRIGGER BlockUISingle BEFORE DELETE ON it_hardware WHEN OLD.Name = 'UI keep' BEGIN SELECT RAISE(ABORT, 'injected single-delete failure'); END;");
        page.on('dialog', dialog => dialog.accept());
        const failedDelete = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url().includes('/api/it/hardware/'));
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
        require('node:assert/strict').equal((await failedDelete).status(), 500);
        await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
        require('node:assert/strict').equal(logistics.prepare("SELECT COUNT(*) AS n FROM it_hardware WHERE Name='UI keep'").get().n, 1);
        logistics.exec('DROP TRIGGER BlockUISingle');
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
        await expect(page.getByRole('row').filter({ hasText: 'UI keep' })).toHaveCount(0);
        require('node:assert/strict').equal(logistics.prepare("SELECT COUNT(*) AS n FROM it_hardware WHERE Name='UI keep'").get().n, 0);
        require('node:assert/strict').deepEqual(errors, []);
        console.log('PASS: browser target changes, confirmation, reset result, filter selection, cancellation, partial failures and retry.');
        await context.close();
    } finally { await browser.close(); await vite.close(); }
};

function assertCount(db, expected) {
    require('node:assert/strict').equal(db.prepare("SELECT COUNT(*) AS n FROM it_hardware WHERE Name LIKE 'UI delete %'").get().n, expected);
}
