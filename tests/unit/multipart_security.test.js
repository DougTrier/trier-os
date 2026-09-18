// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * Multipart security: bounded indices/depth and preserved async plant context.
 * Real HTTP + multer memory storage; no operational DB or uploaded file writes.
 */
const assert = require('assert/strict');
const express = require('express');
const multer = require('multer');
const { AsyncLocalStorage } = require('async_hooks');
(async () => {
    const context = new AsyncLocalStorage();
    const app = express();
    const upload = multer({ storage: multer.memoryStorage(), limits: { fieldArrayIndexLimit: 1000, fieldNestingDepth: 16, fileSize: 1024 } });
    app.use((req, res, next) => context.run('examples', next));
    app.post('/upload', upload.single('attachment'), (req, res) => res.json({ plant: context.getStore(), name: req.body.name, bytes: req.file?.size }));
    app.use((error, req, res, next) => res.status(400).json({ code: error.code }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/upload`;
    try {
        for (const [field, code] of [['items[1001]', 'LIMIT_FIELD_ARRAY_INDEX'], ['a' + '[a]'.repeat(17), 'LIMIT_FIELD_NESTING']]) {
            const form = new FormData(); form.append(field, 'safe-bounded-probe');
            const response = await fetch(url, { method: 'POST', body: form });
            assert.equal(response.status, 400); assert.equal((await response.json()).code, code);
        }
        const form = new FormData(); form.append('name', 'ordinary document'); form.append('attachment', new Blob(['document']), 'legitimate.txt');
        const response = await fetch(url, { method: 'POST', body: form });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { plant: 'examples', name: 'ordinary document', bytes: 8 });
        console.log('Multipart: oversized indices/depth rejected; ordinary attachment and AsyncLocalStorage context preserved.');
    } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
