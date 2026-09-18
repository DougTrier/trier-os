// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * WebSocket fragmentation security regression using bounded real frames.
 * Dependency used by the LAN hub; no destructive memory-exhaustion loop.
 */
const assert = require('assert/strict');
const { Receiver, WebSocket, WebSocketServer } = require('ws');
(async () => {
    const receiver = new Receiver({ maxFragments: 8, maxPayload: 1024 });
    let observed;
    receiver.on('error', error => { observed = error; });
    for (let index = 0; index < 12 && !observed; index++) {
        await new Promise(resolve => receiver.write(Buffer.from([index ? 0x00 : 0x02, 1, 65]), error => {
            if (error) observed = error;
            resolve();
        }));
    }
    receiver.destroy();
    assert(observed, 'Tiny fragments must be bounded even below maxPayload; vulnerable ws ignores maxFragments');
    assert.equal(observed.code, 'WS_ERR_TOO_MANY_BUFFERED_PARTS');
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise(resolve => server.once('listening', resolve));
    server.on('connection', socket => socket.on('message', data => socket.send(data.toString())));
    const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
    try {
        await new Promise((resolve, reject) => { client.once('open', resolve); client.once('error', reject); });
        const reply = new Promise(resolve => client.once('message', data => resolve(data.toString())));
        client.send('scan-', { fin: false }); client.send('normal', { fin: true });
        assert.equal(await reply, 'scan-normal');
    } finally {
        client.terminate();
        for (const socket of server.clients) socket.terminate();
        await new Promise(resolve => server.close(resolve));
    }
    console.log('ws: excessive tiny fragments rejected; ordinary fragmented messages round-trip.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
