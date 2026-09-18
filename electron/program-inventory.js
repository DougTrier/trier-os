// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * Package file inventory for conservative uninstall. Only files produced by the
 * packager are removable; live data and unrecognized customer files are retained.
 * writeInventory(directory): called afterPack or by the portable build.
 * No API routes or runtime database access.
 */
const fs = require('node:fs');
const path = require('node:path');
function writeInventory(root) {
    const files = [];
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) throw new Error('Distribution contains a link');
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(file);
            else files.push(path.relative(root, file));
        }
    }
    walk(root);
    files.push('program-files.json');
    fs.writeFileSync(path.join(root, 'program-files.json'), JSON.stringify([...new Set(files)]));
}
module.exports = { writeInventory };
if (require.main === module) writeInventory(path.resolve(process.argv[2]));
