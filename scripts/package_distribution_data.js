// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * Release data preparation: omit confirmed stale development artifact fixtures.
 * API routes: none. Input: generated distribution data directory only.
 * Source databases and migrations must never be modified by this build utility.
 */
const path = require('path');
const fs = require('fs');
const Database = require('../node_modules/better-sqlite3');
const queries = {
    LocalArtifactCache: {
        select: 'SELECT LocalPath AS filePath FROM LocalArtifactCache WHERE ArtifactID=? AND ArtifactName=?',
        remove: 'DELETE FROM LocalArtifactCache WHERE ArtifactID=? AND ArtifactName=?',
    },
    ArtifactRegistry: {
        select: 'SELECT FilePath AS filePath FROM ArtifactRegistry WHERE ArtifactID=? AND ArtifactName=?',
        remove: 'DELETE FROM ArtifactRegistry WHERE ArtifactID=? AND ArtifactName=?',
    },
};
const sourceRoot = path.resolve(__dirname, '..');
const target = path.resolve(process.argv[2] || sourceRoot);
const relative = path.relative(sourceRoot, target);
if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) {
    throw new Error('Distribution data preparation refuses the source workspace.');
}
for (const [file, table] of [
    ['Plant_1.db', 'LocalArtifactCache'],
    ['trier_logistics.db', 'ArtifactRegistry'],
]) {
    const filename = path.join(target, file);
    if (!fs.existsSync(filename)) continue;
    const db = new Database(filename, { fileMustExist: true });
    try {
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
        const row = db.prepare(queries[table].select)
            .get(1, 'Dummy_Test_Artifact');
        if (!row || !/^[gG]:[\\/]Trier OS[\\/]/.test(row.filePath) || fs.existsSync(row.filePath)) continue;
        db.transaction(() => {
            if (table === 'ArtifactRegistry' && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='EdgeNodeSync'").get()) {
                db.prepare('DELETE FROM EdgeNodeSync WHERE ArtifactID=?').run(1);
            }
            db.prepare(queries[table].remove).run(1, 'Dummy_Test_Artifact');
        })();
        db.exec('VACUUM');
        console.log(`  Removed stale dummy fixture from generated ${file}`);
    } finally {
        db.close();
    }
}
