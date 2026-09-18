// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Full Playwright runner with disposable security probes and explicit test
 * credentials. Requires regression-sandbox.js and restores its temporary creator
 * password afterwards. Live development data is never opened. The tests exercise
 * normal application APIs; this runner does not alter their responses.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const root = path.resolve(process.argv[2]);
const app = path.join(root, 'app');
const marker = JSON.parse(fs.readFileSync(path.join(app, '.regression-sandbox.json')));
if (path.resolve(marker.source) === app || path.resolve(marker.root) !== root) throw new Error('Not an isolated sandbox');
const env = { ...process.env, ...JSON.parse(fs.readFileSync(path.join(root, 'server-env.json'))), TRIER_REGRESSION_APP: app };
if (path.resolve(env.DATA_DIR) !== path.join(app, 'data')) throw new Error('Unsafe test database path');
if (!require('../server/ha_key').isAcceptableKey(env.HA_SYNC_KEY)) throw new Error('Invalid sandbox HA peer key');
const auth = new Database(path.join(env.DATA_DIR, 'trier_auth.db'));
const original = auth.prepare("SELECT UserID,PasswordHash,MustChangePassword FROM Users WHERE Username='creator'").get();
if (!original) throw new Error('No disposable creator account');
env.TRIER_SECURITY_TEST_CREATOR_PASSWORD = crypto.randomBytes(24).toString('base64url');
auth.prepare('UPDATE Users SET PasswordHash=?,MustChangePassword=0 WHERE UserID=?').run(bcrypt.hashSync(env.TRIER_SECURITY_TEST_CREATOR_PASSWORD, 10), original.UserID);
const uploads = path.join(env.DATA_DIR, 'uploads');
fs.mkdirSync(uploads, { recursive: true });
const probe = 'regression-' + crypto.randomUUID();
env.TRIER_UNSAFE_UPLOAD_PATH = '/uploads/' + probe + '.html';
env.TRIER_UNSAFE_SCRIPT_PATH = '/uploads/' + probe + '.js';
const js = "document.documentElement.dataset.auditScriptRan='true';";
fs.writeFileSync(path.join(uploads, probe + '.html'), '<script>' + js + '</script>', { flag: 'wx' });
fs.writeFileSync(path.join(uploads, probe + '.js'), js, { flag: 'wx' });
const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--max-failures=1', '--retries=0', ...process.argv.slice(3)],
    { cwd: app, env, windowsHide: true, stdio: 'inherit' });
child.on('exit', code => {
    auth.prepare('UPDATE Users SET PasswordHash=?,MustChangePassword=? WHERE UserID=?').run(original.PasswordHash, original.MustChangePassword, original.UserID);
    auth.close();
    for (const extension of ['.html', '.js']) fs.unlinkSync(path.join(uploads, probe + extension));
    process.exitCode = code === 0 ? 0 : 1;
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
