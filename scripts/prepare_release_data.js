// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Materialize verified, committed demonstration/reference seeds for packaging.
 * Builds never read live SQLite files. A new output directory is required, and
 * every compressed and expanded file must match the release manifest.
 * CLI: node scripts/prepare_release_data.js <new-output-directory>. No API routes.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const source = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function prepareReleaseData(destination, archiveRoot = path.join(source, 'release-data')) {
    if (!destination) throw new Error('A new packaging output directory is required.');
    const target = path.resolve(destination);
    const relative = path.relative(source, target);
    if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) || fs.existsSync(target)) {
        throw new Error('Release seeds require a NEW directory outside the source. Existing data is never overwritten.');
    }
    for (let parent = path.dirname(target); ; parent = path.dirname(parent)) {
        if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw new Error('Linked output ancestor is not allowed.');
        if (parent === path.dirname(parent)) break;
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(archiveRoot, 'manifest.json'), 'utf8'));
    if (manifest.format !== 1 || manifest.version !== require('../package.json').version || !manifest.files?.length) throw new Error('Invalid release seed manifest.');
    const names = new Set();
    for (const file of manifest.files) {
        if (!/^[A-Za-z0-9_-]+\.db$/.test(file.name) || file.archive !== file.name + '.gz' || names.has(file.name)) throw new Error('Invalid seed filename.');
        names.add(file.name);
        const archive = fs.readFileSync(path.join(archiveRoot, file.archive));
        if (archive.length !== file.archiveBytes || hash(archive) !== file.archiveSha256) throw new Error('Compressed seed verification failed: ' + file.name);
    }
    fs.mkdirSync(target, { recursive: true });
    for (const file of manifest.files) {
        const expanded = zlib.gunzipSync(fs.readFileSync(path.join(archiveRoot, file.archive)), { maxOutputLength: file.bytes });
        if (expanded.length !== file.bytes || hash(expanded) !== file.sha256) throw new Error('Expanded seed verification failed: ' + file.name);
        fs.writeFileSync(path.join(target, file.name), expanded, { flag: 'wx' });
    }
    for (const name of ['plants.json', 'branding.json', 'corporate_leadership.json']) fs.copyFileSync(path.join(source, 'data', name), path.join(target, name), fs.constants.COPYFILE_EXCL);
    return { databases: manifest.files.length, version: manifest.version };
}
module.exports = { prepareReleaseData };
if (require.main === module) {
    try { console.log(JSON.stringify(prepareReleaseData(process.argv[2]))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
