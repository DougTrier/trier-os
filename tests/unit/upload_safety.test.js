// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * Upload safety regression: real raster decoding and static download headers.
 * API dependencies: helpers used by /api/floorplans and /uploads/*.
 */
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const safety = require('../../server/upload_safety');
(async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trier-upload-safety-'));
    const filePath = path.join(directory, 'fixture');
    try {
        for (const [extension, format] of [['png', 'png'], ['jpg', 'jpeg'], ['gif', 'gif'], ['webp', 'webp']]) {
            fs.writeFileSync(filePath, await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).toFormat(format).toBuffer());
            await safety.validateFloorplan({ path: filePath, originalname: `valid.${extension}` });
        }
        fs.writeFileSync(filePath, '<html><script>fetch("/api/auth/me")</script></html>');
        await assert.rejects(safety.validateFloorplan({ path: filePath, originalname: 'disguised.png' }));
        for (const extension of ['html', 'js', 'svg']) {
            safety.floorplanFilter({}, { originalname: `active.${extension}` }, error => assert(error));
        }
        for (const extension of ['html', 'js', 'svg', 'docx']) {
            const headers = {};
            safety.uploadHeaders({ setHeader: (name, value) => { headers[name] = value; } }, `file.${extension}`);
            assert.equal(headers['Content-Disposition'], 'attachment');
            assert.equal(headers['Content-Type'], 'application/octet-stream');
            assert.equal(headers['X-Content-Type-Options'], 'nosniff');
            assert.match(headers['Content-Security-Policy'], /sandbox/);
        }
        for (const extension of ['png', 'jpg', 'gif', 'webp', 'heic', 'pdf', 'mp4', 'mov', 'avi', 'mkv']) {
            const headers = {};
            safety.uploadHeaders({ setHeader: (name, value) => { headers[name] = value; } }, `file.${extension}`);
            assert.equal(headers['Content-Disposition'], undefined);
        }
        console.log('Upload safety: four real image formats accepted; active/disguised content rejected; document downloads preserved.');
    } finally {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        fs.rmdirSync(directory);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
