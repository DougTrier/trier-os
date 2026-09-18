// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Real SPA reset and bulk deletion regression. Requires an explicitly marked
 * isolated application copy; never seeds or injects failures into live data.
 * UI actions use /admin-console and /it-department. SQLite assertions verify
 * POST /api/database/reset-plant and /api/it/:category/bulk-delete outcomes.
 */
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const app = process.env.TRIER_REGRESSION_APP;
const categories = ['hardware', 'software', 'infrastructure', 'mobile'];
const runId = crypto.randomBytes(4).toString('hex');
const target = 'REGRESSION_RESET_' + runId;
const sentinel = 'DO-NOT-TOUCH-SITE_' + runId;
let logistics, auth, plant, protectedRows, originalPlants, sentinelUser, originalRows;
const data = app && path.join(app, 'data');
const digest = rows => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
function retained() {
    return {
        users: digest(auth.prepare('SELECT * FROM Users ORDER BY UserID').all()),
        roles: digest(auth.prepare('SELECT * FROM UserPlantRoles ORDER BY UserID,PlantID').all()),
        groups: digest(auth.prepare('SELECT * FROM UserADGroups ORDER BY ID').all()),
        grants: digest(logistics.prepare('SELECT * FROM GatekeeperRoleMap ORDER BY ID').all()),
        settings: digest(logistics.prepare('SELECT * FROM SystemSettings ORDER BY Key').all()),
        sites: fs.readFileSync(path.join(data, 'plants.json'), 'utf8'),
        assets: categories.map(category => digest(logistics.prepare(`SELECT * FROM it_${category} WHERE PlantID IS NOT ? ORDER BY ID`).all(target))),
    };
}
function preserve() { expect(retained()).toEqual(protectedRows); }
function add(category, name) {
    return Number(logistics.prepare(`INSERT INTO it_${category} (Name,PlantID) VALUES (?,?)`).run(name, target).lastInsertRowid);
}
async function resetUI(page) {
    await page.goto('/admin-console');
    await page.getByText('Database & Backups', { exact: true }).click();
    await page.locator('select').filter({ has: page.locator(`option[value="${target}"]`) }).last().selectOption(target);
    await page.getByRole('button', { name: 'Show reset options' }).click();
    await expect(page.getByText(/records currently targeted/)).toBeVisible();
}
async function confirmReset(page) {
    await page.getByLabel('Confirm selected plant').fill(target);
    await page.getByLabel('Confirm permanent reset').fill('RESET-CONFIRMED');
    const response = page.waitForResponse(response => response.url().endsWith('/api/database/reset-plant') && !response.request().postDataJSON().dryRun);
    await page.getByRole('button', { name: 'Execute reset' }).click();
    return (await response).json();
}
async function inventory(page, category, filter = '') {
    await page.goto('/it-department');
    await page.getByRole('button', { name: category[0].toUpperCase() + category.slice(1), exact: true }).click();
    await page.getByPlaceholder('Search IT assets...').fill(filter);
    await expect(page.getByLabel('Select all filtered assets')).toBeVisible();
}
async function deleteSelected(page, count) {
    await page.getByRole('button', { name: `Delete selected (${count})`, exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(`Delete ${count} selected`);
    await page.getByRole('button', { name: `Permanently delete ${count}`, exact: true }).click();
}
test.describe('Preservation regression (isolated full application)', () => {
    test.describe.configure({ mode: 'serial' });
    test.skip(!app, 'Requires TRIER_REGRESSION_APP pointing to an isolated regression-sandbox.js copy.');
    test.use({ storageState: 'tests/e2e/.auth/ghost_admin.json' });
    test.beforeAll(async () => {
        expect(fs.existsSync(path.join(app, '.regression-sandbox.json'))).toBe(true);
        const marker = JSON.parse(fs.readFileSync(path.join(app, '.regression-sandbox.json'), 'utf8'));
        expect(path.resolve(app)).not.toBe(path.resolve(marker.source));
        expect(path.dirname(path.resolve(app))).toBe(path.resolve(marker.root));
        logistics = new Database(path.join(data, 'trier_logistics.db'));
        auth = new Database(path.join(data, 'trier_auth.db'));
        for (const connection of [logistics, auth]) connection.pragma('busy_timeout=10000');
        originalPlants = fs.readFileSync(path.join(data, 'plants.json'), 'utf8');
        originalRows = retained();
        const sites = JSON.parse(originalPlants);
        expect(sites.some(site => [target, sentinel].includes(site.id))).toBe(false);
        for (const id of [target, sentinel]) {
            const source = new Database(path.join(data, 'schema_template.db'), { readonly: true });
            await source.backup(path.join(data, id + '.db')); source.close();
            sites.push({ id, label: id });
        }
        fs.writeFileSync(path.join(data, 'plants.json'), JSON.stringify(sites));
        const user = auth.prepare("INSERT INTO Users (Username,PasswordHash,DefaultRole,CanImport,CanViewAnalytics) VALUES ('preservation_test','not-a-login-hash','technician',0,1)").run();
        sentinelUser = user.lastInsertRowid;
        auth.prepare('INSERT INTO UserPlantRoles (UserID,PlantID,RoleLevel) VALUES (?,?,?)').run(user.lastInsertRowid, sentinel, 'technician');
        auth.prepare('INSERT INTO UserADGroups (UserID,Username,ADGroup) VALUES (?,?,?)').run(user.lastInsertRowid, 'preservation_test', 'PRESERVATION-GROUP');
        logistics.prepare('INSERT INTO GatekeeperRoleMap (ADGroup,ActionClass,PlantID) VALUES (?,?,?)').run('PRESERVATION-GROUP', 'WORK_ORDER_CREATE', sentinel);
        for (const category of categories) logistics.prepare(`INSERT INTO it_${category} (Name,PlantID) VALUES (?,?)`).run('PRESERVATION-TEST-001-' + category, sentinel);
        plant = new Database(path.join(data, target + '.db'));
        plant.exec('CREATE TABLE RegressionParent(ID INTEGER PRIMARY KEY, Value TEXT); CREATE TABLE RegressionChild(ID INTEGER PRIMARY KEY, ParentID INTEGER REFERENCES RegressionParent(ID)); INSERT INTO RegressionParent VALUES(1,\'reset-parent\'); INSERT INTO RegressionChild VALUES(1,1);');
        protectedRows = retained();
        fs.writeFileSync(path.join(app, '..', 'sentinel-baseline.json'), JSON.stringify(protectedRows, null, 2));
    });
    test.afterAll(() => {
        try {
            if (protectedRows) {
                preserve();
                fs.writeFileSync(path.join(app, '..', 'sentinel-final.json'), JSON.stringify(retained(), null, 2));
                for (const connection of [auth, logistics, plant]) expect(connection.pragma('integrity_check', { simple: true })).toBe('ok');
                for (const connection of [auth, logistics, plant]) expect(connection.pragma('foreign_key_check')).toEqual([]);
                auth.prepare('DELETE FROM UserADGroups WHERE UserID=?').run(sentinelUser);
                auth.prepare('DELETE FROM UserPlantRoles WHERE UserID=?').run(sentinelUser);
                auth.prepare('DELETE FROM Users WHERE UserID=?').run(sentinelUser);
                logistics.prepare('DELETE FROM GatekeeperRoleMap WHERE ADGroup=? AND PlantID=?').run('PRESERVATION-GROUP', sentinel);
                for (const category of categories) logistics.prepare(`DELETE FROM it_${category} WHERE PlantID IN (?,?)`).run(target, sentinel);
                fs.writeFileSync(path.join(data, 'plants.json'), originalPlants);
                expect(retained()).toEqual(originalRows);
                fs.writeFileSync(path.join(app, '..', 'fixture-cleanup.json'), JSON.stringify({ status: 'PASS', originalsUnchanged: true, retainedEvidenceDatabases: [target, sentinel] }));
            }
        } finally { plant?.close(); auth?.close(); logistics?.close(); }
    });
    test('site reset preview, cancel, verified backups, exact scope and empty retry', async ({ page }) => {
        for (const category of categories) add(category, 'Reset fixture ' + category);
        // Real server/database response, delayed past the global offline-write
        // timeout to reproduce the former synthetic-success/replay defect.
        await page.route('**/api/database/reset-plant', async route => {
            const response = await route.fetch();
            if (!route.request().postDataJSON().dryRun) await new Promise(resolve => setTimeout(resolve, 3500));
            await route.fulfill({ response });
        });
        await resetUI(page);
        const preview = await page.evaluate(async selected => (await fetch('/api/database/reset-plant', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-plant-id': selected }, body: JSON.stringify({ dryRun: true }) })).json(), target);
        for (const category of categories) expect(preview.counts['it.it_' + category]).toBe(1);
        for (const [key, count] of Object.entries(preview.counts)) {
            if (key.startsWith('plant.')) expect(plant.prepare(`SELECT COUNT(*) n FROM "${key.slice(6).replaceAll('"', '""')}"`).get().n).toBe(count);
        }
        await expect(page.getByText(`${preview.totalRows.toLocaleString()} records currently targeted.`, { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Close reset options' }).click();
        expect(plant.prepare('SELECT COUNT(*) n FROM RegressionParent').get().n).toBe(1); preserve();
        await page.getByRole('button', { name: 'Show reset options' }).click();
        await expect(page.getByLabel('Confirm selected plant')).toBeVisible();
        const result = await confirmReset(page);
        expect(result.success).toBe(true); expect(result.totalRowsDeleted).toBe(preview.totalRows);
        expect(result.remainingRecords).toBe(0);
        await expect(page.getByText(/0 targeted records remain/)).toBeVisible();
        for (const [file, table] of [[result.snapshotFile, 'RegressionParent'], [result.logisticsSnapshotFile, 'it_hardware']]) {
            const backup = new Database(path.join(data, file), { readonly: true, fileMustExist: true });
            expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
            const count = table === 'it_hardware' ? backup.prepare('SELECT COUNT(*) n FROM it_hardware WHERE PlantID=?').get(target).n : backup.prepare('SELECT COUNT(*) n FROM RegressionParent').get().n;
            expect(count).toBe(1); backup.close();
        }
        for (const category of categories) expect(logistics.prepare(`SELECT COUNT(*) n FROM it_${category} WHERE PlantID=?`).get(target).n).toBe(0);
        expect(plant.prepare('SELECT COUNT(*) n FROM RegressionParent').get().n).toBe(0); preserve();
        await resetUI(page); const empty = await confirmReset(page); expect(empty.totalRowsDeleted).toBe(0); preserve();
        await page.screenshot({ path: path.join(app, '..', 'reset-complete.png'), fullPage: true });
    });
    test('site reset database failure rolls back both stores and reports failure', async ({ page }) => {
        plant.exec("INSERT INTO RegressionParent VALUES(2,'rollback'); CREATE TRIGGER RegressionBlock BEFORE DELETE ON RegressionParent BEGIN SELECT RAISE(ABORT,'regression injected failure'); END;");
        const id = add('hardware', 'Rollback hardware');
        try {
            await resetUI(page); const result = await confirmReset(page);
            expect(result.success).not.toBe(true); await expect(page.getByRole('alert').filter({ hasText: 'Plant reset did not complete' })).toBeVisible();
            expect(plant.prepare('SELECT ID FROM RegressionParent WHERE ID=2').get()).toBeTruthy();
            expect(logistics.prepare('SELECT ID FROM it_hardware WHERE ID=?').get(id)).toBeTruthy(); preserve();
        } finally { plant.exec('DROP TRIGGER RegressionBlock'); }
        await resetUI(page); expect((await confirmReset(page)).success).toBe(true); preserve();
    });
    test('failed backup prevents deletion and surfaces an error', async ({ page }) => {
        const id = add('hardware', 'Backup failure hardware');
        const ps = text => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ErrorActionPreference='Stop'; " + text, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true }).trim();
        const directory = data.replaceAll("'", "''");
        const acl = ps(`([IO.DirectoryInfo]::new('${directory}')).GetAccessControl().Sddl`);
        try {
            ps(`$d=[IO.DirectoryInfo]::new('${directory}'); $a=$d.GetAccessControl(); $s=[Security.Principal.WindowsIdentity]::GetCurrent().User; $r=[Security.AccessControl.FileSystemAccessRule]::new($s,'CreateFiles','None','None','Deny'); $a.AddAccessRule($r); $d.SetAccessControl($a)`);
            await resetUI(page); const result = await confirmReset(page);
            expect(result.success).not.toBe(true);
            await expect(page.getByRole('alert').filter({ hasText: 'Plant reset did not complete' })).toBeVisible();
            expect(logistics.prepare('SELECT ID FROM it_hardware WHERE ID=?').get(id)).toBeTruthy(); preserve();
        } finally { ps(`$d=[IO.DirectoryInfo]::new('${directory}'); $a=$d.GetAccessControl(); $a.SetSecurityDescriptorSddlForm('${acl.replaceAll("'", "''")}',[Security.AccessControl.AccessControlSections]::Access); $d.SetAccessControl($a)`); }
        await resetUI(page); expect((await confirmReset(page)).success).toBe(true); preserve();
    });
    for (const category of categories) test(`${category}: selection, cancellation, references, failures and durable deletion`, async ({ page }) => {
        const prefix = 'REG-' + category;
        const ids = ['single', 'multi-a', 'multi-b', 'filter-a', 'filter-b', 'keep'].map(suffix => add(category, prefix + '-' + suffix));
        const otherCategories = () => categories.filter(other => other !== category).map(other => digest(logistics.prepare(`SELECT * FROM it_${other} ORDER BY ID`).all()));
        const otherBefore = otherCategories();
        logistics.prepare('INSERT INTO it_asset_user_link (AssetCategory,AssetID,UserEmail) VALUES (?,?,?)').run(category, ids[0], 'preservation@example.invalid');
        await inventory(page, category);
        const allCount = logistics.prepare(`SELECT COUNT(*) n FROM it_${category}`).get().n;
        await expect(page.getByLabel('Select all filtered assets')).toBeEnabled();
        await page.getByLabel('Select all filtered assets').check();
        await page.getByRole('button', { name: `Delete selected (${allCount})`, exact: true }).click();
        await expect(page.getByRole('dialog')).toContainText(`Delete ${allCount} selected`);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.getByPlaceholder('Search IT assets...').fill(prefix);
        await expect(page.getByRole('button', { name: 'Delete selected (0)' })).toBeDisabled();
        await page.getByLabel('Select all filtered assets').check();
        await page.getByRole('button', { name: 'Delete selected (6)' }).click();
        await expect(page.getByRole('dialog')).toContainText(`${target}: 6`);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect(logistics.prepare(`SELECT COUNT(*) n FROM it_${category} WHERE PlantID=?`).get(target).n).toBe(6); preserve();
        await page.getByLabel('Select all filtered assets').uncheck();
        await page.getByLabel('Select ' + prefix + '-single', { exact: true }).check();
        await deleteSelected(page, 1); await expect(page.getByText('1 deleted. 0 not deleted or unverified.', { exact: true })).toBeVisible();
        expect(logistics.prepare('SELECT * FROM it_asset_user_link WHERE AssetCategory=? AND AssetID=?').get(category, ids[0])).toBeUndefined(); preserve();
        for (const suffix of ['multi-a', 'multi-b']) await page.getByLabel('Select ' + prefix + '-' + suffix, { exact: true }).check();
        await deleteSelected(page, 2); await expect(page.getByText('2 deleted. 0 not deleted or unverified.', { exact: true })).toBeVisible(); preserve();
        await page.getByPlaceholder('Search IT assets...').fill(prefix + '-filter');
        await page.getByLabel('Select all filtered assets').check();
        logistics.exec(`CREATE TRIGGER RegressionBulkBlock BEFORE DELETE ON it_${category} WHEN OLD.ID=${ids[4]} BEGIN SELECT RAISE(ABORT,'regression injected failure'); END;`);
        try {
            await deleteSelected(page, 2); await expect(page.getByText(/1 deleted\. 1 not deleted or unverified/)).toBeVisible();
            await expect(page.getByLabel('Select ' + prefix + '-filter-b', { exact: true })).toBeChecked();
            expect(logistics.prepare(`SELECT ID FROM it_${category} WHERE ID=?`).get(ids[4])).toBeTruthy(); preserve();
        } finally { logistics.exec('DROP TRIGGER RegressionBulkBlock'); }
        await deleteSelected(page, 1); await expect(page.getByText('1 deleted. 0 not deleted or unverified.', { exact: true })).toBeVisible();
        await inventory(page, category, prefix);
        await expect(page.getByLabel('Select ' + prefix + '-keep', { exact: true })).toBeVisible();
        for (const id of ids.slice(0, -1)) expect(logistics.prepare(`SELECT ID FROM it_${category} WHERE ID=?`).get(id)).toBeUndefined();
        preserve();
        await page.getByLabel('Select all filtered assets').check(); await deleteSelected(page, 1);
        await expect(page.getByText('1 deleted. 0 not deleted or unverified.', { exact: true })).toBeVisible(); preserve();
        expect(otherCategories()).toEqual(otherBefore);
    });
    test('application restart preserves identities, groups, grants, sites and assets', async ({ page }) => {
        const root = path.dirname(app);
        const info = JSON.parse(fs.readFileSync(path.join(root, 'server-process.json')));
        expect(path.resolve(info.app)).toBe(path.resolve(app));
        const env = JSON.parse(fs.readFileSync(path.join(root, 'server-env.json')));
        expect(path.resolve(env.DATA_DIR)).toBe(path.resolve(data));
        fs.writeFileSync(path.join(root, 'restart-request'), String(info.pid), { flag: 'wx' });
        process.kill(info.pid);
        await expect.poll(() => JSON.parse(fs.readFileSync(path.join(root, 'server-process.json'))).pid).not.toBe(info.pid);
        await expect.poll(async () => { try { return (await page.request.get('/api/health', { timeout: 1000 })).status(); } catch { return 0; } }, { timeout: 30000 }).toBe(200);
        await inventory(page, 'hardware', 'PRESERVATION-TEST-001');
        await expect(page.getByLabel('Select PRESERVATION-TEST-001-hardware', { exact: true })).toBeVisible();
        preserve();
    });
});
