// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * Untrusted upload safety: raster floorplan validation and static response headers.
 * Used by POST /api/floorplans upload routes and GET /uploads/*.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const formats = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif', '.webp': 'webp' };

function floorplanFilter(req, file, cb) {
    if (!formats[path.extname(file.originalname).toLowerCase()]) {
        return cb(new Error('Floorplans must be PNG, JPEG, GIF or WebP images.'));
    }
    cb(null, true);
}

async function validateFloorplan(file) {
    const bytes = fs.readFileSync(file.path);
    let format;
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) format = 'png';
    else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) format = 'jpeg';
    else if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) format = 'gif';
    else if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') format = 'webp';
    if (!format || format !== formats[path.extname(file.originalname).toLowerCase()]) throw new Error('File contents must match a supported image format.');
    const image = sharp(bytes, { failOn: 'error' });
    const metadata = await image.metadata();
    if (metadata.format !== format) throw new Error('Invalid image format.');
    await image.stats(); // Decode pixels, not merely the caller-supplied extension or MIME.
}

function uploadHeaders(res, filePath) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    // Keep ordinary images, audio/video and PDF viewing usable. Active and
    // unknown attachments remain stored but are delivered as downloads.
    if (!/\.(png|jpe?g|gif|webp|bmp|ico|heic|heif|avif|tiff?|pdf|mp4|webm|mov|avi|mkv|mp3|wav|ogg)$/i.test(filePath)) {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment');
    }
}

module.exports = { floorplanFilter, validateFloorplan, uploadHeaders };
