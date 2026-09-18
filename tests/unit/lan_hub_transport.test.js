// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * Real LAN-hub transport smoke test: HTTP health, token rejection, PING/PONG.
 * API dependencies: /hub/ping and WebSocket port 1940. No scans or DB writes.
 */
const assert = require('assert/strict');
const crypto = require('crypto');
const os = require('os');
const jwt = require('jsonwebtoken');
const { WebSocket } = require('ws');
const hub = require('../../server/lan_hub');
const secret = crypto.randomBytes(32).toString('hex');
const clients = [];
function connect(token) {
    const client = new WebSocket('ws://127.0.0.1:1940/?token=' + encodeURIComponent(token));
    clients.push(client);
    return client;
}
(async () => {
    hub.start({ dataDir: os.tmpdir(), jwtSecret: secret, centralUrl: null });
    try {
        const invalid = connect('invalid');
        const closed = await new Promise((resolve, reject) => {
            invalid.once('close', code => resolve(code)); invalid.once('error', reject);
        });
        assert.equal(closed, 4003);
        const client = connect(jwt.sign({ Username: 'transport_test', nativePlantId: 'examples' }, secret, { expiresIn: '1m' }));
        const pong = new Promise((resolve, reject) => {
            client.on('message', raw => { if (JSON.parse(raw).type === 'PONG') resolve(); });
            client.once('error', reject);
        });
        await new Promise((resolve, reject) => { client.once('open', resolve); client.once('error', reject); });
        client.send(JSON.stringify({ type: 'PING' })); await pong;
        const health = await fetch('http://127.0.0.1:1940/hub/ping');
        assert.equal(health.status, 200); assert.equal((await health.json()).clients, 1);
        console.log('Real hub transport: invalid token rejected, valid client PING/PONG and HTTP health passed. Offline replay not exercised.');
    } finally {
        for (const client of clients) client.terminate();
        hub.stop();
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
