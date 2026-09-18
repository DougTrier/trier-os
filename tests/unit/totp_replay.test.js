// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * TOTP replay regression using the actual authentication router and SQLite.
 * A controlled clock covers adjacent accepted counters without real-time sleeps.
 * API dependency: POST /api/auth/verify-2fa; independent-process SQLite reopen
 * verifies persistent replay state. All identities/secrets are disposable.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const OTPAuth = require('otpauth');
const { spawnSync } = require('node:child_process');
async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trier-totp-'));
    process.env.DATA_DIR = root;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    process.env.HUB_TOKEN_SECRET = crypto.randomBytes(32).toString('hex');
    const print = console.log; let auth;
    try { console.log = () => {}; auth = require('../../server/auth_db'); } finally { console.log = print; }
    const { db } = require('../../server/logistics_db');
    db.exec('CREATE TABLE IF NOT EXISTS creator_settings(Key TEXT PRIMARY KEY, Value TEXT, UpdatedAt TEXT)');
    const creator = auth.prepare("SELECT UserID FROM Users WHERE Username='creator'").get();
    const app = express(); app.use(express.json()); app.use('/api/auth', require('../../server/routes/auth'));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const realNow = Date.now; let now = Math.floor(realNow() / 30000) * 30000 + 5000;
    Date.now = () => now;
    let totp;
    function enroll() {
        const secret = new OTPAuth.Secret();
        totp = new OTPAuth.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret });
        const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(process.env.JWT_SECRET).digest(), iv);
        const value = cipher.update(secret.base32, 'utf8', 'hex') + cipher.final('hex');
        db.prepare("INSERT OR REPLACE INTO creator_settings(Key,Value) VALUES ('totp_secret',?)").run([iv.toString('hex'), cipher.getAuthTag().toString('hex'), value].join(':'));
        return secret.base32;
    }
    const token = () => jwt.sign({ UserID: creator.UserID, Username: 'creator', pre2fa: true }, process.env.JWT_SECRET, { expiresIn: '5m', jwtid: crypto.randomUUID() });
    async function verify(timestamp = now, preAuthToken = token(), overrideCode) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/verify-2fa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preAuthToken, code: overrideCode || totp.generate({ timestamp }) }) });
        return { status: response.status, body: await response.json() };
    }
    try {
        enroll();
        assert.equal((await verify()).status, 200, 'First valid code');
        assert.equal((await verify()).status, 401, 'Exact reuse is replay');
        now += 30000;
        assert.equal((await verify()).status, 200, 'Next time-step must not be confused with the previous delta=0');
        assert.equal((await verify(now - 30000)).status, 401, 'Previously consumed adjacent code');
        const secret = enroll();
        assert.equal((await verify()).status, 200, 'New secret does not inherit consumed counters');
        assert.equal((await verify(now - 30000)).status, 200, 'Unused previous-window code remains accepted');
        assert.equal((await verify(now + 30000)).status, 200, 'Unused future-window code remains accepted');
        assert.equal((await verify(now + 30000)).status, 401, 'Future-window reuse rejected');
        const { consumeCounter } = require('../../server/totp_replay');
        const args = { userId: creator.UserID, secret, counter: Math.floor(now / 30000) + 1, currentCounter: Math.floor(now / 30000), legacyCreator: true };
        assert.equal(consumeCounter(db, { ...args, userId: creator.UserID + 1000, legacyCreator: false }), true, 'Separate users do not share state');
        const child = spawnSync(process.execPath, ['-e', `const D=require('better-sqlite3'),d=new D(process.argv[1]);const {consumeCounter}=require(process.argv[2]);if(consumeCounter(d,JSON.parse(process.argv[3])))process.exitCode=1;d.close();`, path.join(root, 'trier_logistics.db'), path.resolve(__dirname, '../../server/totp_replay.js'), JSON.stringify(args)], { windowsHide: true, encoding: 'utf8' });
        assert.equal(child.status, 0, 'Consumed counters survive process restart: ' + child.stderr);
        const badToken = token();
        for (let i = 0; i < 5; i++) assert.equal((await verify(now, badToken, 'invalid')).status, 401);
        assert.equal((await verify(now, badToken, 'invalid')).status, 429, 'Attempt lockout retained');
        assert.ok(db.prepare("SELECT COUNT(*) n FROM AuditLog WHERE Action='LOGIN_2FA_SUCCESS'").get().n >= 5);
        assert.ok(db.prepare("SELECT COUNT(*) n FROM AuditLog WHERE Action='LOGIN_2FA_REPLAY_REJECTED'").get().n >= 3);
        now += 90000;
        db.exec("CREATE TRIGGER DenyReplayWrite BEFORE INSERT ON creator_settings WHEN NEW.Key LIKE 'totp_replay:%' BEGIN SELECT RAISE(ABORT,'injected replay storage failure'); END;");
        assert.equal((await verify()).status, 503, 'Replay storage failure must not issue a session');
        console.log('PASS TOTP counters, reuse, skew, new secret, independent users, restart, audit and lockout.');
        console.log('Isolated evidence:', root);
    } finally { Date.now = realNow; await new Promise(resolve => server.close(resolve)); db.close(); auth.close(); }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
