// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * Explicit HA pairing-key provisioning.
 * Reads HA_SYNC_KEY or an administrator-provisioned local .sync_key, never
 * generates a key on demand and never falls back to a known secret. The retired
 * repository key is rejected by fingerprint without embedding its value.
 * Actions: getSyncKey, validateSyncKey, isAcceptableKey; no exposed API routes.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const RETIRED_KEY_HASH = '7cc126a737d827f5484b324cd509422a51673f5cc9df00771c4821370420b65c';

function isAcceptableKey(key) {
    return typeof key === 'string' && /^[a-fA-F0-9]{64}$/.test(key) &&
        crypto.createHash('sha256').update(key.toLowerCase()).digest('hex') !== RETIRED_KEY_HASH;
}
function getSyncKey() {
    try {
        const key = process.env.HA_SYNC_KEY !== undefined ? process.env.HA_SYNC_KEY.trim() :
            fs.readFileSync(path.join(require('./resolve_data_dir'), '.sync_key'), 'utf8').trim();
        return isAcceptableKey(key) ? key : null;
    } catch { return null; }
}
function validateSyncKey(provided) {
    const expected = getSyncKey();
    return Boolean(expected && isAcceptableKey(provided) &&
        crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex')));
}
module.exports = { getSyncKey, validateSyncKey, isAcceptableKey };
