// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * HA key regression: actual key reader with isolated file and environment.
 * Missing/unreadable/invalid provisioning must deny trust; correct explicit
 * provisioning succeeds without creating a fallback credential.
 * API dependencies: /api/ha/health and /api/sync/replicate authentication.
 */
const assert = require('assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trier-ha-key-test-'));
process.env.DATA_DIR = dir;
delete process.env.HA_SYNC_KEY;
const keys = require('../../server/ha_key');
assert.equal(keys.getSyncKey(), null);
assert.equal(keys.validateSyncKey(undefined), false);
assert.equal(keys.validateSyncKey('trier-ha-default-key'), false);
assert.equal(fs.existsSync(path.join(dir, '.sync_key')), false);
process.env.HA_SYNC_KEY = 'invalid';
assert.equal(keys.getSyncKey(), null);
const valid = crypto.randomBytes(32).toString('hex');
process.env.HA_SYNC_KEY = valid;
assert.equal(keys.validateSyncKey(valid), true);
assert.equal(keys.validateSyncKey(crypto.randomBytes(32).toString('hex')), false);
delete process.env.HA_SYNC_KEY;
fs.mkdirSync(path.join(dir, '.sync_key'));
assert.equal(keys.getSyncKey(), null); // unreadable as a file
fs.rmdirSync(path.join(dir, '.sync_key'));
fs.writeFileSync(path.join(dir, '.sync_key'), valid, { mode: 0o600 });
assert.equal(keys.validateSyncKey(valid), true);
if (process.env.TRIER_RETIRED_HA_KEY) {
    process.env.HA_SYNC_KEY = process.env.TRIER_RETIRED_HA_KEY;
    assert.equal(keys.getSyncKey(), null);
    assert.equal(keys.validateSyncKey(process.env.TRIER_RETIRED_HA_KEY), false);
}
fs.unlinkSync(path.join(dir, '.sync_key')); fs.rmdirSync(dir);
console.log('HA provisioning checks passed; keys omitted.');
