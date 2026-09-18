// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Isolated full-application regression runner. Copies code and verified offline
 * development data into a new evidence directory, then starts the real server.
 * No live installers or databases are opened. API: normal server/index.js routes.
 * Run: node tests/regression-sandbox.js <evidence-root>; Ctrl+C stops its child.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = path.resolve(process.argv[2]);
const app = path.join(root, 'app');
const source = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(root, 'backup', 'baseline.json'))) throw new Error('Verified backup is required.');
const restart = process.argv.includes('--restart');
if (fs.existsSync(app) && !restart) throw new Error('Sandbox must be new.');
if (restart && !fs.existsSync(path.join(app, '.regression-sandbox.json'))) throw new Error('Not a regression sandbox.');
if (!restart) {
fs.mkdirSync(app);
for (const name of ['server', 'src', 'dist', 'public', 'electron', 'tests', 'scripts', 'package.json', 'package-lock.json', 'playwright.config.js', 'electron-builder.json']) {
    fs.cpSync(path.join(source, name), path.join(app, name), { recursive: true });
}
fs.symlinkSync(path.join(source, 'node_modules'), path.join(app, 'node_modules'), 'junction');
fs.cpSync(path.join(root, 'backup', 'raw', 'development'), path.join(app, 'data'), { recursive: true });
fs.writeFileSync(path.join(app, '.regression-sandbox.json'), JSON.stringify({ root, source, created: new Date().toISOString() }));
}
const env = { ...process.env, NODE_ENV: 'test', DATA_DIR: path.join(app, 'data'), PORT: '3000', HTTPS_PORT: '1938',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'), HUB_TOKEN_SECRET: crypto.randomBytes(48).toString('hex'),
    HA_SYNC_KEY: crypto.randomBytes(32).toString('hex'), EDGE_MESH_TOKEN: crypto.randomBytes(48).toString('hex'),
    GATEKEEPER_URL: 'http://127.0.0.1:4001', DISABLE_LIVE_STUDIO: 'true', LAN_HUB_ENABLED: 'true', RATE_LIMIT_LOGIN_MAX: '500' };
// Store only generated test configuration, never the caller's inherited secrets.
const savedEnv = path.join(root, 'server-env.json');
if (restart && fs.existsSync(savedEnv)) Object.assign(env, JSON.parse(fs.readFileSync(savedEnv)));
if (!require('../server/ha_key').isAcceptableKey(env.HA_SYNC_KEY)) throw new Error('Sandbox HA key must be a valid 64-character hex peer key.');
fs.writeFileSync(savedEnv, JSON.stringify(Object.fromEntries(['NODE_ENV','DATA_DIR','PORT','HTTPS_PORT','JWT_SECRET','HUB_TOKEN_SECRET','HA_SYNC_KEY','EDGE_MESH_TOKEN','GATEKEEPER_URL','DISABLE_LIVE_STUDIO','LAN_HUB_ENABLED','RATE_LIMIT_LOGIN_MAX'].map(key => [key, env[key]]))));
const log = fs.openSync(path.join(root, 'server.log'), 'a');
let child;
function start() {
    child = spawn(process.execPath, ['server/index.js'], { cwd: app, env, windowsHide: true, stdio: ['ignore', log, log] });
    fs.writeFileSync(path.join(root, 'server-process.json'), JSON.stringify({ pid: child.pid, app }));
    console.log(`Isolated application: ${app}; server PID ${child.pid}`);
    child.on('exit', code => {
        const restartRequest = path.join(root, 'restart-request');
        if (fs.existsSync(restartRequest)) { fs.unlinkSync(restartRequest); start(); }
        else { fs.closeSync(log); process.exitCode = code || 0; }
    });
}
start();
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
