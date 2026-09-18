// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * Native image security baseline and generated CAD/LiDAR SVG conversion smoke.
 * API dependencies: image helpers for floorplans, DXF and LiDAR imports.
 */
const assert = require('assert/strict');
const sharp = require('sharp');
function atLeast(actual, minimum) {
    const left = actual.split('.').map(Number), right = minimum.split('.').map(Number);
    for (let index = 0; index < right.length; index++) {
        if (left[index] !== right[index]) return left[index] > right[index];
    }
    return true;
}
(async () => {
    assert(atLeast(sharp.versions.sharp, '0.35.4'), 'Requires sharp security fixes through 0.35.4');
    assert(atLeast(sharp.versions.vips, '8.18.3'), 'Loaded libvips must contain published parser fixes');
    assert(atLeast(sharp.versions.heif, '1.23.2'), 'Loaded libheif must contain published parser fixes');
    const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="white"/></svg>')).png().toBuffer();
    assert.equal((await sharp(png).metadata()).format, 'png');
    console.log(`Native image security: sharp ${sharp.versions.sharp}, libvips ${sharp.versions.vips}, libheif ${sharp.versions.heif}; generated SVG conversion passed.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
