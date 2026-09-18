// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Release-input regression: real committed seed archives, credential exclusion,
 * required catalog preservation and refusal to overwrite initialized storage.
 * No application routes; all writes use a new isolated temporary directory.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { prepareReleaseData } = require('../../scripts/prepare_release_data');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trier-release-seeds-'));
const output = path.join(root, 'seeds');
const archives = path.resolve(__dirname, '../../release-data');
const manifest = JSON.parse(fs.readFileSync(path.join(archives, 'manifest.json')));
assert.equal(prepareReleaseData(output).databases, 11);
assert.ok(fs.existsSync(path.join(output, 'mfg_master.db')), 'Required catalog must ship from a clean checkout');
for (const file of manifest.files) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(output, file.name))).digest('hex');
    assert.equal(actual, file.sha256);
}
const logistics = new Database(path.join(output, 'trier_logistics.db'), { readonly: true });
for (const table of ['GatekeeperRoleMap', 'vendor_portal_access', 'ERPConnectors', 'DTSyncConfig', 'api_keys', 'creator_settings', 'two_factor_codes', 'ChatProfile']) {
    assert.equal(logistics.prepare('SELECT COUNT(*) n FROM "' + table + '"').get().n, 0, table + ' must not distribute credentials or test grants');
}
assert.ok(logistics.prepare('SELECT COUNT(*) n FROM it_hardware').get().n > 0, 'Intentional demonstration assets must survive');
logistics.close();
assert.throws(() => prepareReleaseData(output), /NEW directory/);
assert.throws(() => prepareReleaseData(path.resolve(__dirname, '../../data')), /NEW directory/);
const broken = path.join(root, 'broken-archives');
fs.mkdirSync(broken);
const first = manifest.files[0];
fs.writeFileSync(path.join(broken, 'manifest.json'), JSON.stringify({ ...manifest, files: [first] }));
fs.writeFileSync(path.join(broken, first.archive), Buffer.from('corrupt'));
assert.throws(() => prepareReleaseData(path.join(root, 'corrupt-output'), broken), /verification failed/);
assert.equal(fs.existsSync(path.join(root, 'corrupt-output')), false);
console.log('PASS: committed seeds, unchanged catalog hash, excluded credentials/test grants, retained demo assets, overwrite guards and corrupt-archive rejection. Evidence: ' + root);
