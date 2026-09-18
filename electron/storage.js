// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * Persistent deployment storage. The installer owns adoption and initialization;
 * the launcher only reads its durable pointer and refuses unfinished updates.
 * resolveDeployment(installDir): resolves retained data without reseeding it.
 * No HTTP routes; credentials and groups remain in the retained auth database.
 */
const fs = require('node:fs');
const path = require('node:path');

function resolveDeployment(installDir) {
    const pointer = JSON.parse(fs.readFileSync(path.join(installDir, 'trier-deployment.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(pointer.StateRoot, 'deployment.json'), 'utf8'));
    if (fs.existsSync(path.join(pointer.StateRoot, 'maintenance.json'))) {
        throw new Error('An installation was interrupted. Finish or roll back the installer before starting Trier OS.');
    }
    if (path.resolve(manifest.InstallDir).toLowerCase() !== path.resolve(installDir).toLowerCase() ||
        pointer.DataDir !== manifest.DataDir || !fs.existsSync(pointer.DataDir) || manifest.SeedPending) {
        throw new Error('Persistent storage is missing or requires initialization. Run the installer; existing data will not be recreated.');
    }
    return pointer.DataDir;
}
module.exports = { resolveDeployment };
