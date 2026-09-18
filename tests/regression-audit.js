// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.
/**
 * Read-only working-tree audit inventory. Hashes every changed/untracked file,
 * parses changed JS/JSX, and records migration/protected-file differences.
 * Output supports manual review; syntax checks are not a security proof.
 * CLI: node tests/regression-audit.js <output.json>. No application API calls.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const git = args => execFileSync('git', ['-c', 'core.safecrlf=false', ...args], { cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const changed = git(['diff', '--name-only', '-z']).split('\0').filter(Boolean);
const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
const report = { commit: git(['rev-parse', 'HEAD']).trim(), at: new Date().toISOString(), files: [],
    changedMigrations: changed.filter(file => file.startsWith('server/migrations/')),
    protectedDifferences: changed.filter(file => ['server/UNTOUCHABLE_dairy_master.js','server/routes/scan.js','server/lan_hub.js','server/ha_sync.js'].includes(file)) };
for (const file of [...new Set([...changed, ...untracked])].sort()) {
    const full = path.join(root, file);
    const entry = { file, state: untracked.includes(file) ? 'untracked' : 'modified' };
    if (!fs.existsSync(full)) { entry.state = 'deleted'; report.files.push(entry); continue; }
    const bytes = fs.readFileSync(full);
    entry.sha256 = crypto.createHash('sha256').update(bytes).digest('hex'); entry.bytes = bytes.length;
    if (/\.(js|jsx)$/.test(file)) {
        const source = bytes.toString('utf8');
        try { esbuild.transformSync(source, { loader: file.endsWith('.jsx') ? 'jsx' : 'js' }); entry.syntax = 'PASS'; }
        catch (error) { entry.syntax = 'FAIL'; entry.error = error.message; }
        const header = source.slice(0, 400);
        entry.header = /Copyright © 2026 Doug Trier/.test(header) && /MIT/.test(header) && /LICENSE/.test(header) ? 'PASS' : 'REVIEW';
        entry.reviewSignals = source.split(/\r?\n/).flatMap((line, index) => /\b(execSync|execFileSync|spawnSync|spawn|unlinkSync|rmSync|DELETE FROM|DROP TABLE|new Database)\b/.test(line) ? [index + 1] : []);
    }
    report.files.push(entry);
}
fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ commit: report.commit, files: report.files.length, changedMigrations: report.changedMigrations,
    protectedDifferences: report.protectedDifferences, syntaxFailures: report.files.filter(file => file.syntax === 'FAIL'), headerReview: report.files.filter(file => file.header === 'REVIEW').map(file => file.file) }, null, 2));
