// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Live Studio Backend API
 * =====================================
 * The server-side engine for the in-app IDE sandbox. Provides secure file
 * read/write within whitelisted directories, git branch management, a full
 * deploy pipeline with auto-tagging, and an immutable deployment ledger.
 *
 * All endpoints are protected by the requireStudio middleware which enforces
 * the Creator or IT Admin role. Every file operation is path-validated against
 * a hard whitelist — no symlinks, no binaries, no access outside src/components
 * or server/routes. Critical pipeline files (vite.config.js, package.json) are
 * blocked from direct writes and require the deploy pipeline instead.
 *
 * ENDPOINTS:
 *   GET    /api/studio/files              — List all whitelisted editable files
 *   GET    /api/studio/file?path=...      — Read a single whitelisted file
 *   POST   /api/studio/file              — Write a whitelisted file (< 1MB)
 *   GET    /api/studio/git/status        — Current branch, dirty flag, last stable tag
 *   POST   /api/studio/git/branch        — Create or switch to a sandbox branch
 *   POST   /api/studio/deploy            — Full deploy pipeline (requires "DEPLOY NOW")
 *   GET    /api/studio/deploy/:id        — Poll deploy status by ledger ID
 *   POST   /api/studio/deploy/revert     — Revert to last stable-* tag
 *   GET    /api/studio/ledger            — Deployment history (last 50 entries)
 *   GET    /api/studio/health            — Health check for client state machine
 *   POST   /api/studio/analyze/friction  — Frictional Cost Engine: UX financial analyzer
 *   POST   /api/studio/simulation/create — Clone + strip plant DB to cutoff date
 *   GET    /api/studio/simulation/:id/compare — Split-screen KPI comparison (live vs sim)
 *   DELETE /api/studio/simulation/:id   — Destroy simulation session + temp DB
 *   POST   /api/studio/analyze/blast-radius — Blast-radius route impact mapper (§14)
 *   GET    /api/studio/ledger/search    — Filtered deploy history search (§15)
 *   GET    /api/studio/plants           — List plants for simulation picker
 *
 * SECURITY MODEL:
 *   - Only Creator username or IT Admin globalRole can access any endpoint
 *   - Path resolution enforces whitelist before every read/write
 *   - Symlinks are explicitly rejected
 *   - Mutex: only one BUILDING deploy entry allowed at a time
 *   - Every write and deploy action is recorded in AuditLog
 *
 * DEPLOY PIPELINE (POST /deploy):
 *   1. Insert ledger entry with BUILDING status
 *   2. Check mutex (block if another deploy is BUILDING)
 *   3. Stage src/components/ and server/routes/
 *   4. Commit sandbox branch
 *   5. npm run build (120s timeout)
 *   6. Auto-tag stable-YYYY-MM-DD
 *   7. Optional PM2 reload (non-fatal if PM2 unavailable)
 *   Responds immediately with ledgerId — client polls /deploy/:id for status.
 *
 * TABLES (in trier_logistics.db):
 *   StudioDeployLedger — full history of every deploy/revert
 *   StudioFileDiff     — per-file change record attached to each ledger entry
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { execSync, execFileSync } = require('child_process');
const { db: logDb, logAudit } = require('../logistics_db');

// Project root (two levels up from server/routes/)
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Hard-whitelisted directories — only these may be read or written
const WHITELIST_DIRS = [
    path.join(PROJECT_ROOT, 'src', 'components'),
    path.join(PROJECT_ROOT, 'server', 'routes'),
];

// Files that cannot be written directly — must go through the deploy pipeline
const PROTECTED_BASENAMES = ['vite.config.js', 'package.json', 'index.js'];

// Allowed file extensions for reads and writes
const ALLOWED_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.css', '.json', '.md'];

// ── Initialize Studio tables in trier_logistics.db ────────────────────────
logDb.exec(`
    CREATE TABLE IF NOT EXISTS StudioDeployLedger (
        ID          INTEGER PRIMARY KEY AUTOINCREMENT,
        DeployedBy  TEXT    NOT NULL,
        SandboxBranch TEXT,
        CommitSHA   TEXT,
        StableTag   TEXT,
        Status      TEXT    DEFAULT 'PENDING'
                    CHECK (Status IN ('PENDING','BUILDING','SUCCESS','FAILED','REVERTED')),
        BuildLog    TEXT,
        StartedAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
        CompletedAt DATETIME,
        Notes       TEXT
    );
    CREATE TABLE IF NOT EXISTS StudioFileDiff (
        ID          INTEGER PRIMARY KEY AUTOINCREMENT,
        LedgerID    INTEGER REFERENCES StudioDeployLedger(ID),
        FilePath    TEXT    NOT NULL,
        ChangeType  TEXT    CHECK (ChangeType IN ('MODIFIED','ADDED','DELETED')),
        LinesAdded  INTEGER DEFAULT 0,
        LinesRemoved INTEGER DEFAULT 0,
        RecordedAt  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// ── Access Control ───────────────────────────────────────────────────────────
function requireStudio(req, res, next) {
    // Production deployments compiled with DISABLE_LIVE_STUDIO=true have the IDE stripped
    if (process.env.DISABLE_LIVE_STUDIO === 'true') {
        return res.status(503).json({ error: 'Live Studio is not available in production deployments.' });
    }
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (user.Username === 'creator' || user.globalRole === 'creator' || user.globalRole === 'it_admin') return next();
    logAudit(user.Username, 'STUDIO_ACCESS_DENIED', null, {}, 'WARNING', req.ip);
    return res.status(403).json({ error: 'Live Studio requires Creator or IT Admin access' });
}
router.use(requireStudio);

// ── Path Safety ──────────────────────────────────────────────────────────────
// Resolves a relative path and validates it against the whitelist.
// Returns the absolute path or null if rejected.
function resolveWhitelisted(relativePath) {
    // Must be a string without null bytes
    if (typeof relativePath !== 'string' || relativePath.includes('\0')) return null;
    const abs = path.resolve(PROJECT_ROOT, relativePath);
    // Reject symlinks
    if (fs.existsSync(abs)) {
        try {
            const real = fs.realpathSync(abs);
            if (real !== abs) return null;
        } catch { return null; }
    }
    // Must fall within a whitelisted directory
    const allowed = WHITELIST_DIRS.some(dir => abs.startsWith(dir + path.sep) || abs === dir);
    if (!allowed) return null;
    // Extension whitelist
    const ext = path.extname(abs).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) return null;
    return abs;
}

// ── Recursive file collector ──────────────────────────────────────────────────
// Returns all file paths under baseDir, skipping symlinked directories.
// Symlinked files are caught later by resolveWhitelisted().
function collectFiles(baseDir) {
    const results = [];
    function walk(dir) {
        try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isSymbolicLink()) continue;
                const abs = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(abs);
                else if (entry.isFile()) results.push(abs);
            }
        } catch { /* skip unreadable dirs */ }
    }
    walk(baseDir);
    return results;
}

// ── GET /api/studio/search?q=... ─────────────────────────────────────────────
// Full-text search across all whitelisted source files. Returns files that
// contain the query string with up to 3 line-preview snippets per file,
// sorted by match count descending.
router.get('/search', (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json({ results: [], query: q || '' });
    const query = q.trim().toLowerCase();
    const results = [];
    WHITELIST_DIRS.forEach(dir => {
        if (!fs.existsSync(dir)) return;
        const section = path.relative(PROJECT_ROOT, dir).replace(/\\/g, '/');
        collectFiles(dir)
            .filter(abs => ['.js', '.jsx', '.ts', '.tsx'].includes(path.extname(abs).toLowerCase()))
            .sort()
            .forEach(abs => {
                const relPath = path.relative(PROJECT_ROOT, abs).replace(/\\/g, '/');
                const name = path.basename(abs);
                try {
                    const content = fs.readFileSync(abs, 'utf8');
                    const lines = content.split('\n');
                    const matches = [];
                    lines.forEach((line, idx) => {
                        if (line.toLowerCase().includes(query)) {
                            matches.push({ line: idx + 1, text: line.trim().slice(0, 120) });
                        }
                    });
                    if (matches.length > 0) {
                        results.push({
                            name, path: relPath, section,
                            matchCount: matches.length,
                            matches: matches.slice(0, 3),
                        });
                    }
                } catch { /* skip unreadable */ }
            });
    });
    results.sort((a, b) => b.matchCount - a.matchCount);
    res.json({ results, query: q });
});

// ── GET /api/studio/files ────────────────────────────────────────────────────
// Returns a flat list of all editable files grouped by section.
router.get('/files', (req, res) => {
    try {
        const files = [];
        WHITELIST_DIRS.forEach(dir => {
            if (!fs.existsSync(dir)) return;
            const section = path.relative(PROJECT_ROOT, dir).replace(/\\/g, '/');
            collectFiles(dir)
                .filter(abs => ['.js', '.jsx', '.ts', '.tsx'].includes(path.extname(abs).toLowerCase()))
                .sort()
                .forEach(abs => {
                    const rel = path.relative(PROJECT_ROOT, abs).replace(/\\/g, '/');
                    const stats = fs.statSync(abs);
                    files.push({ name: path.basename(abs), path: rel, section, size: stats.size, mtime: stats.mtime });
                });
        });
        res.json({ files });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list files: ' });
    }
});

// ── GET /api/studio/file?path=... ────────────────────────────────────────────
// Reads a single whitelisted file. Rejects files over 1MB.
router.get('/file', (req, res) => {
    const relPath = req.query.path;
    if (!relPath) return res.status(400).json({ error: 'path query parameter required' });
    const abs = resolveWhitelisted(relPath);
    if (!abs) return res.status(403).json({ error: 'Path not permitted' });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File not found' });
    try {
        const stats = fs.statSync(abs);
        if (stats.size > 1024 * 1024) return res.status(413).json({ error: 'File exceeds 1MB read limit' });
        const content = fs.readFileSync(abs, 'utf8');
        res.json({ content, path: relPath, size: stats.size });
    } catch (err) {
        res.status(500).json({ error: 'Failed to read file: ' });
    }
});

// ── POST /api/studio/file ────────────────────────────────────────────────────
// Writes content to a whitelisted file. Blocks critical pipeline files.
router.post('/file', (req, res) => {
    const { path: relPath, content } = req.body;
    if (!relPath || content === undefined) return res.status(400).json({ error: 'path and content are required' });

    // Block protected files from direct writes
    const basename = path.basename(relPath);
    if (PROTECTED_BASENAMES.includes(basename)) {
        return res.status(403).json({ error: `${basename} cannot be edited directly. Use the deploy pipeline.` });
    }

    const abs = resolveWhitelisted(relPath);
    if (!abs) return res.status(403).json({ error: 'Path not permitted' });

    const byteSize = Buffer.byteLength(content, 'utf8');
    if (byteSize > 1024 * 1024) return res.status(413).json({ error: 'Content exceeds 1MB write limit' });

    try {
        fs.writeFileSync(abs, content, 'utf8');
        logAudit(req.user.Username, 'STUDIO_FILE_WRITE', null, { path: relPath, bytes: byteSize }, 'INFO', req.ip);
        res.json({ success: true, message: 'File saved' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to write file: ' });
    }
});

// ── GET /api/studio/git/status ───────────────────────────────────────────────
// Returns current branch, dirty status, and last stable tag.
router.get('/git/status', (req, res) => {
    const opts = { cwd: PROJECT_ROOT, stdio: ['pipe', 'pipe', 'pipe'], timeout: 8000 };
    try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', opts).toString().trim();
        const statusOut = execSync('git status --porcelain', opts).toString().trim();
        const isDirty = statusOut.length > 0;
        const changedFiles = isDirty ? statusOut.split('\n').length : 0;
        let lastStableTag = null;
        try {
            lastStableTag = execSync('git tag --list "stable-*" --sort=-version:refname', opts)
                .toString().trim().split('\n')[0] || null;
        } catch { /* git tag may fail in bare repos */ }
        res.json({ branch, isDirty, changedFiles, lastStableTag });
    } catch (err) {
        // Return a graceful degraded response instead of a hard 500 so the
        // studio still opens — the branch badge simply won't appear.
        console.error('[Live Studio] git/status failed:', err.message);
        res.json({ branch: 'unknown', isDirty: false, changedFiles: 0, lastStableTag: null, warning: 'Unavailable' });
    }
});

// ── POST /api/studio/git/branch ──────────────────────────────────────────────
// Creates or switches to a sandbox branch. Enforces naming convention.
router.post('/git/branch', (req, res) => {
    const { branchName } = req.body;
    if (!branchName) return res.status(400).json({ error: 'branchName required' });
    if (!/^studio\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(branchName)) {
        return res.status(400).json({ error: 'Branch must follow pattern: studio/<user>/<descriptor>' });
    }
    try {
        const existing = execSync(`git branch --list "${branchName}"`, { cwd: PROJECT_ROOT }).toString().trim();
        if (existing) {
            execSync(`git checkout "${branchName}"`, { cwd: PROJECT_ROOT });
            logAudit(req.user.Username, 'STUDIO_BRANCH_SWITCH', null, { branch: branchName }, 'INFO', req.ip);
            res.json({ success: true, action: 'switched', branch: branchName });
        } else {
            execSync(`git checkout -b "${branchName}"`, { cwd: PROJECT_ROOT });
            logAudit(req.user.Username, 'STUDIO_BRANCH_CREATE', null, { branch: branchName }, 'INFO', req.ip);
            res.json({ success: true, action: 'created', branch: branchName });
        }
    } catch (err) {
        res.status(500).json({ error: 'Branch operation failed: ' });
    }
});

// ── POST /api/studio/git/commit ─────────────────────────────────────────────
// Stage all working changes and commit to the current branch.
router.post('/git/commit', (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Commit message required' });
    try {
        const status = execSync('git status --porcelain', { cwd: PROJECT_ROOT }).toString().trim();
        if (!status) return res.status(400).json({ error: 'Nothing to commit — working tree is clean' });
        execSync('git add -A', { cwd: PROJECT_ROOT });
        const safeUsername = String(req.user.Username || 'unknown').replace(/[^a-zA-Z0-9_\-\.]/g, '');
        const msg = `${message.trim()}\n\nCommitted via Live Studio by ${safeUsername}`;
        execFileSync('git', ['commit', '-m', msg], { cwd: PROJECT_ROOT });
        const hash = execSync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT }).toString().trim();
        logAudit(req.user.Username, 'STUDIO_COMMIT', null, { message: message.trim(), hash }, 'INFO', req.ip);
        res.json({ success: true, hash, message: message.trim() });
    } catch (err) {
        res.status(500).json({ error: 'Commit failed: ' });
    }
});

// ── POST /api/studio/deploy ──────────────────────────────────────────────────
// Full deploy pipeline. Responds immediately; client polls /deploy/:id.
router.post('/deploy', (req, res) => {
    const { confirmation, notes } = req.body;
    if (confirmation !== 'DEPLOY NOW') {
        return res.status(400).json({ error: 'Deploy requires confirmation: "DEPLOY NOW"' });
    }

    let branch = 'unknown';
    try { branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT }).toString().trim(); } catch {}

    // Insert ledger entry
    const ledgerEntry = logDb.prepare(
        `INSERT INTO StudioDeployLedger (DeployedBy, SandboxBranch, Status, Notes) VALUES (?, ?, 'BUILDING', ?)`
    ).run(req.user.Username, branch, notes || null);
    const ledgerId = ledgerEntry.lastInsertRowid;

    // Mutex: block if another deploy is already BUILDING
    const activeDeploy = logDb.prepare(
        `SELECT ID, DeployedBy FROM StudioDeployLedger WHERE Status = 'BUILDING' AND ID != ?`
    ).get(ledgerId);
    if (activeDeploy) {
        logDb.prepare(`UPDATE StudioDeployLedger SET Status = 'FAILED', BuildLog = ?, CompletedAt = datetime('now') WHERE ID = ?`)
            .run(`Blocked: ${activeDeploy.DeployedBy} has a deploy in progress (ledger #${activeDeploy.ID})`, ledgerId);
        return res.status(409).json({ error: `Deploy locked: ${activeDeploy.DeployedBy} is deploying (ledger #${activeDeploy.ID})` });
    }

    // Respond immediately — client will poll /deploy/:id
    res.json({ success: true, ledgerId, status: 'BUILDING', message: 'Deploy pipeline started' });

    // Async pipeline — runs after response is sent
    setImmediate(() => {
        let buildLog = '';
        const opts = { cwd: PROJECT_ROOT, stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 };
        try {
            // ── Pre-flight: syntax check any changed server/routes/ .js files ────
            // A syntax error in a server route will crash Express and take the studio
            // down with it — catch it here before it's ever committed or deployed.
            buildLog += '[0/4] Pre-flight syntax check on server/routes/ changes...\n';
            try {
                const changedServer = execSync('git diff --name-only HEAD -- server/routes/', opts)
                    .toString().trim();
                const serverJsFiles = changedServer.split('\n').filter(f => f.trim().endsWith('.js'));
                if (serverJsFiles.length === 0) {
                    buildLog += '       No server/routes/ changes — skipping.\n';
                } else {
                    for (const f of serverJsFiles) {
                        const abs = path.join(PROJECT_ROOT, f.trim());
                        if (!fs.existsSync(abs)) continue;
                        try {
                            execSync(`"${process.execPath}" --check "${abs}"`,
                                { ...opts, timeout: 5000 });
                            buildLog += `       ✓ ${f}\n`;
                        } catch (syntaxErr) {
                            const msg = syntaxErr.stderr
                                ? syntaxErr.stderr.toString().trim()
                                : syntaxErr.message;
                            buildLog += `       ✗ ${f}\n       ${msg}\n`;
                            throw new Error(
                                `Syntax error in ${f} — deploy aborted to protect the running server.\n${msg}`
                            );
                        }
                    }
                    buildLog += '       All server files passed syntax check.\n';
                }
            } catch (preflightErr) {
                if (preflightErr.message.includes('Syntax error')) throw preflightErr;
                // git diff failed (e.g. no git) — skip the check, don't block
                buildLog += `       (Pre-flight skipped: ${preflightErr.message})\n`;
            }

            buildLog += `[1/4] Staging whitelisted changes on branch: ${branch}\n`;
            execSync('git add src/components/ server/routes/', { cwd: PROJECT_ROOT });

            buildLog += '[2/4] Committing sandbox branch...\n';
            try {
                const safeUsernameDeploy = String(req.user.Username || 'unknown').replace(/[^a-zA-Z0-9_\\-\\.]/g, '');
                execSync(`git commit -m "studio: live deploy by ${safeUsernameDeploy}"`, { cwd: PROJECT_ROOT });
                const sha = execSync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT }).toString().trim();
                buildLog += `       Commit: ${sha}\n`;
            } catch (e) {
                if (e.message && e.message.includes('nothing to commit')) {
                    buildLog += '       (nothing to commit — HEAD is clean)\n';
                } else {
                    throw e;
                }
            }

            buildLog += '[3/4] Running npm run build...\n';
            const buildOut = execSync('npm run build 2>&1', { cwd: PROJECT_ROOT, timeout: 120000 }).toString();
            buildLog += buildOut.length > 3000 ? '...(truncated)\n' + buildOut.slice(-2500) : buildOut;
            buildLog += '\n       Build successful.\n';

            buildLog += '[4/4] Applying stable tag...\n';
            const today = new Date().toISOString().slice(0, 10);
            const stableTag = `stable-${today}`;
            try {
                execSync(`git tag ${stableTag}`, { cwd: PROJECT_ROOT });
                buildLog += `       Tagged: ${stableTag}\n`;
            } catch {
                buildLog += `       (tag ${stableTag} already exists — skipped)\n`;
            }

            const commitSha = execSync('git rev-parse HEAD', { cwd: PROJECT_ROOT }).toString().trim();
            logDb.prepare(
                `UPDATE StudioDeployLedger SET Status='SUCCESS', BuildLog=?, CommitSHA=?, StableTag=?, CompletedAt=datetime('now') WHERE ID=?`
            ).run(buildLog, commitSha, stableTag, ledgerId);

            logAudit(req.user.Username, 'STUDIO_DEPLOY_SUCCESS', null, { ledgerId, stableTag, branch }, 'INFO', '');

            // PM2 reload — non-fatal if PM2 not available
            try {
                execSync('pm2 reload all --update-env', { cwd: PROJECT_ROOT, timeout: 30000 });
                buildLog += '       PM2 reloaded.\n';
            } catch {
                buildLog += '       (PM2 not available — manual restart may be required)\n';
            }

        } catch (err) {
            buildLog += `\n[ERROR] ${err.message}\n`;
            logDb.prepare(
                `UPDATE StudioDeployLedger SET Status='FAILED', BuildLog=?, CompletedAt=datetime('now') WHERE ID=?`
            ).run(buildLog, ledgerId);
            logAudit(req.user.Username, 'STUDIO_DEPLOY_FAILED', null, { ledgerId, error: err.message }, 'WARNING', '');
        }
    });
});

// ── GET /api/studio/deploy/:id ───────────────────────────────────────────────
// Poll endpoint — returns the current status and log for a deploy ledger entry.
router.get('/deploy/:id', (req, res) => {
    const entry = logDb.prepare('SELECT * FROM StudioDeployLedger WHERE ID = ?').get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Deploy entry not found' });
    res.json(entry);
});

// ── POST /api/studio/deploy/revert ──────────────────────────────────────────
// Reverts the working tree to the most recent stable-* tag.
// NOTE: must be registered BEFORE /deploy/:id to avoid 'revert' being treated as an ID.
router.post('/deploy/revert', (req, res) => {
    const opts = { cwd: PROJECT_ROOT, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 };
    try {
        const tagList = execSync('git tag --list "stable-*" --sort=-version:refname', opts).toString().trim();
        const tag = tagList.split('\n')[0];
        if (!tag) return res.status(400).json({ error: 'No stable-* tag found to revert to' });

        execSync(`git checkout "${tag}"`, opts);

        const ledgerEntry = logDb.prepare(
            `INSERT INTO StudioDeployLedger (DeployedBy, Status, StableTag, Notes, CompletedAt) VALUES (?, 'REVERTED', ?, 'Manual revert via Live Studio', datetime('now'))`
        ).run(req.user.Username, tag);

        logAudit(req.user.Username, 'STUDIO_REVERT', null, { tag, ledgerId: ledgerEntry.lastInsertRowid }, 'WARNING', req.ip);

        // Respond immediately so the browser knows the revert succeeded.
        res.json({ success: true, revertedTo: tag, ledgerId: ledgerEntry.lastInsertRowid });

        // Rebuild + reload in the background — this is what actually fixes a crashed server.
        // git checkout restores the source files; npm build + PM2 reload puts the stable
        // code back into the running process. Non-fatal if either step fails.
        setImmediate(() => {
            try {
                execSync('npm run build', { cwd: PROJECT_ROOT, stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 });
            } catch (buildErr) {
                console.error('[Live Studio] Revert rebuild failed:', buildErr.message);
            }
            try {
                execSync('pm2 reload all --update-env', opts);
            } catch {
                // PM2 not available in dev — that's fine
            }
            logDb.prepare(
                `UPDATE StudioDeployLedger SET Notes = Notes || ' (rebuild + PM2 reload completed)' WHERE ID = ?`
            ).run(ledgerEntry.lastInsertRowid);
        });
    } catch (err) {
        res.status(500).json({ error: 'Revert failed: ' });
    }
});

// ── GET /api/studio/ledger ───────────────────────────────────────────────────
// Returns last 50 deploy entries for the audit ledger UI.
router.get('/ledger', (req, res) => {
    try {
        const entries = logDb.prepare('SELECT * FROM StudioDeployLedger ORDER BY ID DESC LIMIT 50').all();
        res.json({ entries });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch ledger: ' });
    }
});

// ── GET /api/studio/ledger/search ───────────────────────────────────────────
// §15 Executive Intelligence Audit Ledger — filtered search endpoint.
// Supports any combination of: free-text q, user, from/to dates, branch, tag, status.
// Returns up to 200 entries ordered newest first.
router.get('/ledger/search', (req, res) => {
    try {
        const { q, user, from, to, branch, tag, status } = req.query;
        let sql = 'SELECT * FROM StudioDeployLedger WHERE 1=1';
        const params = [];

        if (user)   { sql += ' AND DeployedBy LIKE ?';     params.push(`%${user}%`); }
        if (branch) { sql += ' AND SandboxBranch LIKE ?';  params.push(`%${branch}%`); }
        if (tag)    { sql += ' AND StableTag LIKE ?';       params.push(`%${tag}%`); }
        if (status) { sql += ' AND Status = ?';             params.push(status.toUpperCase()); }
        if (from)   { sql += ' AND StartedAt >= ?';         params.push(from); }
        if (to)     { sql += ' AND StartedAt <= ?';         params.push(to + ' 23:59:59'); }
        if (q) {
            sql += ' AND (Notes LIKE ? OR SandboxBranch LIKE ? OR CommitSHA LIKE ? OR DeployedBy LIKE ?)';
            params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
        }

        sql += ' ORDER BY ID DESC LIMIT 200';
        const entries = logDb.prepare(sql).all(...params);
        res.json({ entries, count: entries.length });
    } catch (err) {
        res.status(500).json({ error: 'Ledger search failed: ' });
    }
});

// ── GET /api/studio/health ───────────────────────────────────────────────────
// Lightweight health check used by the client state machine during deploys.
router.get('/health', (req, res) => {
    res.json({ status: 'ok', ts: Date.now() });
});

// ════════════════════════════════════════════════════════════════════════════
// §9 FRICTIONAL COST ENGINE — Deterministic UX Financial Analyzer
// Compares interactive UI node counts between the current saved file and git
// HEAD, applies physics-based time multipliers, and projects annual dollar
// impact across the plant network.
//
// Physics Baseline (from industrial HMI research):
//   Text input field  = 3.0s  (locate, tap, type, confirm)
//   Number input      = 2.0s
//   Dropdown select   = 1.0s
//   Checkbox / Radio  = 0.3s
//   Button tap        = 0.5s
//   Barcode scan      = 1.5s  (raise scanner, aim, trigger, wait for beep)
//   Textarea          = 5.0s  (locate, tap, type multi-line, confirm)
// ════════════════════════════════════════════════════════════════════════════

const FRICTION_PHYSICS = {
    'text-input':  { ms: 3000, label: 'Text Input Field',  icon: '⌨️',  unit: 'field' },
    'num-input':   { ms: 2000, label: 'Number Input',      icon: '#️⃣',  unit: 'field' },
    'select':      { ms: 1000, label: 'Dropdown Select',   icon: '🔽',  unit: 'select' },
    'checkbox':    { ms:  300, label: 'Checkbox',          icon: '☑️',  unit: 'tap'   },
    'radio':       { ms:  300, label: 'Radio Button',      icon: '🔘',  unit: 'tap'   },
    'button':      { ms:  500, label: 'Button Click',      icon: '🖱️',  unit: 'tap'   },
    'barcode':     { ms: 1500, label: 'Barcode Scan',      icon: '📷',  unit: 'scan'  },
    'textarea':    { ms: 5000, label: 'Text Area',         icon: '📝',  unit: 'field' },
};

function countInteractiveElements(content) {
    return {
        'text-input': (content.match(/<input\b(?=[^>]*type=["']text["'])[^>]*/gi) || []).length +
                      (content.match(/<input\b(?![^>]*type=["'])[^>]*/gi) || []).length,
        'num-input':  (content.match(/<input\b[^>]*type=["']number["'][^>]*/gi) || []).length,
        'select':     (content.match(/<select\b[^>]*/gi) || []).length,
        'checkbox':   (content.match(/type=["']checkbox["']/gi) || []).length,
        'radio':      (content.match(/type=["']radio["']/gi) || []).length,
        'button':     (content.match(/<button\b[^>]*/gi) || []).length,
        'barcode':    Math.min((content.match(/onScan|handleScan|barcode|Barcode|scanner|Scanner/g) || []).length, 5),
        'textarea':   (content.match(/<textarea\b[^>]*/gi) || []).length,
    };
}

// POST /api/studio/analyze/friction
router.post('/analyze/friction', (req, res) => {
    const { filePath, currentContent } = req.body;
    if (!filePath || currentContent === undefined) {
        return res.status(400).json({ error: 'filePath and currentContent required' });
    }
    const abs = resolveWhitelisted(filePath);
    if (!abs) return res.status(403).json({ error: 'Path not permitted' });

    try {
        // Get baseline from git HEAD (null if file is new)
        let originalContent = '';
        try {
            originalContent = execSync(
                `git show HEAD:"${filePath.replace(/\\/g, '/')}"`,
                { cwd: PROJECT_ROOT, timeout: 5000 }
            ).toString();
        } catch { /* new file — baseline is zero */ }

        const originalCounts = countInteractiveElements(originalContent);
        const newCounts      = countInteractiveElements(currentContent);

        // Build delta breakdown — only include elements that actually changed
        let totalDeltaMs = 0;
        const breakdown = [];
        Object.keys(FRICTION_PHYSICS).forEach(key => {
            const delta = (newCounts[key] || 0) - (originalCounts[key] || 0);
            if (delta === 0) return;
            const physics  = FRICTION_PHYSICS[key];
            const costMs   = delta * physics.ms;
            totalDeltaMs  += costMs;
            breakdown.push({ key, label: physics.label, icon: physics.icon, unit: physics.unit, delta, msEach: physics.ms, costMs });
        });

        // Estimate daily usage frequency from AuditLog (last 30 days)
        let dailyUsage = 30;
        try {
            const name = path.basename(filePath, path.extname(filePath));
            const row  = logDb.prepare(
                `SELECT COUNT(*) as cnt FROM AuditLog WHERE details LIKE ? AND timestamp > datetime('now','-30 days')`
            ).get(`%${name}%`);
            if (row && row.cnt > 15) dailyUsage = Math.max(10, Math.round(row.cnt / 30));
        } catch {}

        // Annual financial projection
        const HOURLY_WAGE   = 25;   // USD — plant operator average
        const WORKING_DAYS  = 250;
        const PLANT_COUNT   = 40;   // enterprise-wide

        const annualSeconds = (totalDeltaMs / 1000) * dailyUsage * WORKING_DAYS * PLANT_COUNT;
        const annualHours   = annualSeconds / 3600;
        const annualDollars = annualHours * HOURLY_WAGE;

        const verdict = totalDeltaMs === 0 ? 'neutral'
                      : totalDeltaMs  < 0  ? 'savings'
                      : 'cost';

        res.json({
            filePath,
            breakdown,
            totals: {
                deltaMs: totalDeltaMs,
                deltaSeconds: parseFloat((totalDeltaMs / 1000).toFixed(2)),
            },
            annual: {
                hours:   parseFloat(Math.abs(annualHours).toFixed(1)),
                dollars: parseFloat(Math.abs(annualDollars).toFixed(0)),
                verdict,
            },
            assumptions: { dailyUsage, HOURLY_WAGE, WORKING_DAYS, PLANT_COUNT },
        });
    } catch (err) {
        res.status(500).json({ error: 'Friction analysis failed: ' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
// §14 VISUAL CHANGE CONSEQUENCE ANALYZER — Static Blast-Radius Mapper
// Given a component file (or the current git diff), parses App.jsx to extract
// all React Router route->component mappings, then traces ES6 import chains
// one level deep across src/components/ to identify both direct and indirect
// route impacts. Returns a structured blast-radius map for the Impact tab.
//
// Analysis steps:
//   1. Identify changed component files (from filePath param or git diff HEAD)
//   2. Parse App.jsx with regex to extract <Route path="..." element={<Comp />} mappings
//   3. Match changed component basenames against route component names (direct hit)
//   4. Scan all src/components/ files for import statements referencing changed files
//   5. Cross-reference importing components against the route map (indirect hit)
// ════════════════════════════════════════════════════════════════════════════

// POST /api/studio/analyze/blast-radius
router.post('/analyze/blast-radius', (req, res) => {
    try {
        const { filePath } = req.body;

        // Step 1: Resolve which component files are in scope
        let changedComponents = [];
        if (filePath && filePath.includes('src/components')) {
            const abs = resolveWhitelisted(filePath);
            if (abs) changedComponents = [{ file: filePath, basename: path.basename(filePath) }];
        } else {
            // Fall back to git diff HEAD + staged
            try {
                const diff   = execSync('git diff HEAD --name-only',     { cwd: PROJECT_ROOT, timeout: 5000 }).toString().trim();
                const staged = execSync('git diff --cached --name-only', { cwd: PROJECT_ROOT, timeout: 5000 }).toString().trim();
                const all    = [...new Set([...diff.split('\n'), ...staged.split('\n')])].filter(Boolean);
                changedComponents = all
                    .filter(f => f.startsWith('src/components/') && /\.(jsx?|tsx?)$/.test(f))
                    .map(f => ({ file: f, basename: path.basename(f) }));
            } catch { /* git unavailable */ }
        }

        // Step 2: Extract React Router route->component mappings from App.jsx
        const appJsxPath = path.join(PROJECT_ROOT, 'src', 'App.jsx');
        const routeMap   = [];
        if (fs.existsSync(appJsxPath)) {
            const appContent = fs.readFileSync(appJsxPath, 'utf8');
            // Pattern: path="..." element={<ComponentName or path='...' element={<ComponentName
            const pat = /path=["']([^"']+)["'][^>]{0,200}?element=\{<([A-Za-z][A-Za-z0-9_]*)/g;
            let m;
            while ((m = pat.exec(appContent)) !== null) {
                routeMap.push({ path: m[1], component: m[2] });
            }
            // Also catch element-first pattern
            const pat2 = /element=\{<([A-Za-z][A-Za-z0-9_]*)[^>]{0,200}?path=["']([^"']+)["']/g;
            while ((m = pat2.exec(appContent)) !== null) {
                if (!routeMap.some(r => r.path === m[2] && r.component === m[1])) {
                    routeMap.push({ path: m[2], component: m[1] });
                }
            }
        }

        // Step 3: Direct route hits — component name matches a route entry
        const affectedRoutes = [];
        const changedBasenames = changedComponents.map(c => path.basename(c.basename, path.extname(c.basename)));
        routeMap.forEach(route => {
            if (changedBasenames.includes(route.component)) {
                if (!affectedRoutes.some(r => r.path === route.path)) {
                    affectedRoutes.push({ path: route.path, component: route.component, impact: 'direct' });
                }
            }
        });

        // Step 4: Scan src/components for ES6 imports of the changed files
        const componentsDir     = path.join(PROJECT_ROOT, 'src', 'components');
        const importingComponents = [];
        if (fs.existsSync(componentsDir)) {
            fs.readdirSync(componentsDir)
                .filter(f => /\.(jsx?|tsx?)$/.test(f))
                .forEach(fname => {
                    try {
                        const content = fs.readFileSync(path.join(componentsDir, fname), 'utf8');
                        const imported = changedBasenames.filter(base => {
                            // import ... from './Base' or '../Base' — case-sensitive basename
                            return new RegExp(`from\\s+['"][./]+${base}['"]`).test(content) ||
                                   new RegExp(`require\\(['"][./]+${base}['"]\\)`).test(content);
                        });
                        if (imported.length > 0) {
                            const compBase = path.basename(fname, path.extname(fname));
                            importingComponents.push({ file: fname, basename: compBase, imports: imported });
                            // Check if this importer is itself on a route (indirect hit)
                            routeMap.forEach(route => {
                                if (route.component === compBase && !affectedRoutes.some(r => r.path === route.path)) {
                                    affectedRoutes.push({ path: route.path, component: route.component, impact: 'indirect', via: fname });
                                }
                            });
                        }
                    } catch { /* skip unreadable files */ }
                });
        }

        const summary = changedComponents.length === 0
            ? 'No changed component files detected in the current scope.'
            : `${changedComponents.length} component(s) changed, touching ${affectedRoutes.length} route(s) across ${affectedRoutes.filter(r => r.impact === 'direct').length} direct and ${affectedRoutes.filter(r => r.impact === 'indirect').length} indirect hits.`;

        logAudit(req.user.Username, 'STUDIO_BLAST_RADIUS', null, { changedCount: changedComponents.length, routeCount: affectedRoutes.length }, 'INFO', req.ip);
        res.json({ changedComponents, affectedRoutes, importingComponents, routeMap, summary });
    } catch (err) {
        res.status(500).json({ error: 'Blast-radius analysis failed: ' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
// §10 PARALLEL UNIVERSE — Side-by-Side Future Simulation Engine
// Clones a plant SQLite DB, strips data to a target date boundary, then
// computes KPI metrics from both the live DB and the cloned snapshot for
// split-screen comparison ("Old Logic vs. New Logic").
// ════════════════════════════════════════════════════════════════════════════

const os   = require('os');
const Database = require('better-sqlite3');

// Simulation sessions stored in memory (keyed by simId)
const simSessions = new Map();

const SAFE_PLANT_ID_SIM = /^[a-zA-Z0-9_-]{1,64}$/;

// POST /api/studio/simulation/create
// Clones the target plant DB, strips records after cutoffDate, stores simId.
router.post('/simulation/create', (req, res) => {
    const { plantId, cutoffDate } = req.body;
    if (!plantId || !cutoffDate) return res.status(400).json({ error: 'plantId and cutoffDate required' });

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
        return res.status(400).json({ error: 'cutoffDate must be YYYY-MM-DD' });
    }
    if (!SAFE_PLANT_ID_SIM.test(plantId)) {
        return res.status(400).json({ error: 'Invalid plantId format' });
    }

    const dataDir  = require('../resolve_data_dir');
    const srcPath  = path.join(dataDir, `${plantId}.db`);
    if (!fs.existsSync(srcPath)) return res.status(404).json({ error: `Plant DB not found: ${plantId}` });

    const simId   = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const simPath = path.join(os.tmpdir(), `trios_${simId}.db`);

    try {
        // Clone the DB file
        fs.copyFileSync(srcPath, simPath);

        // Open clone and strip records after cutoffDate
        const simDb = new Database(simPath);
        simDb.pragma('journal_mode = WAL');

        // Strip Work Orders added after cutoffDate
        try { simDb.prepare(`DELETE FROM Work WHERE AddDate > ?`).run(cutoffDate); } catch {}
        // Strip Schedule next dates after cutoffDate
        try { simDb.prepare(`UPDATE Schedule SET NextDate = NULL WHERE NextDate > ?`).run(cutoffDate); } catch {}
        // Strip AuditLog entries after cutoffDate
        try { simDb.prepare(`DELETE FROM AuditLog WHERE timestamp > ?`).run(cutoffDate); } catch {}

        simDb.close();

        simSessions.set(simId, { plantId, cutoffDate, simPath, createdAt: Date.now() });

        // Auto-expire after 30 minutes
        setTimeout(() => {
            simSessions.delete(simId);
            try { fs.unlinkSync(simPath); } catch {}
        }, 30 * 60 * 1000);

        logAudit(req.user.Username, 'STUDIO_SIM_CREATE', plantId, { simId, cutoffDate }, 'INFO', req.ip);
        res.json({ success: true, simId, plantId, cutoffDate, message: 'Simulation DB cloned and stripped to cutoff date' });
    } catch (err) {
        try { fs.unlinkSync(simPath); } catch {}
        res.status(500).json({ error: 'Simulation create failed: ' });
    }
});

// GET /api/studio/simulation/:simId/compare
// Reads KPI metrics from both the live plant DB and the simulation clone.
// Returns a side-by-side comparison object for the split-screen twin UI.
router.get('/simulation/:simId/compare', (req, res) => {
    const session = simSessions.get(req.params.simId);
    if (!session) return res.status(404).json({ error: 'Simulation session not found or expired' });

    const dataDir = require('../resolve_data_dir');
    const livePath = path.join(dataDir, `${session.plantId}.db`);

    try {
        const liveDb = new Database(livePath, { readonly: true });
        const simDb  = new Database(session.simPath, { readonly: true });

        const getMetrics = (db, label) => {
            const metrics = { label };
            try { metrics.openWOs       = db.prepare(`SELECT COUNT(*) as n FROM Work WHERE StatusID NOT IN ('50','completed','Completed','closed','Closed')`).get().n; } catch { metrics.openWOs = null; }
            try { metrics.completedWOs  = db.prepare(`SELECT COUNT(*) as n FROM Work WHERE StatusID IN ('50','completed','Completed','closed','Closed')`).get().n; } catch { metrics.completedWOs = null; }
            try { metrics.overdueWOs    = db.prepare(`SELECT COUNT(*) as n FROM Work WHERE SchDate < date('now') AND StatusID NOT IN ('50','completed','Completed','closed','Closed')`).get().n; } catch { metrics.overdueWOs = null; }
            try { metrics.pmSchedules   = db.prepare(`SELECT COUNT(*) as n FROM Schedule WHERE Active = 1 OR Active IS NULL`).get().n; } catch { metrics.pmSchedules = null; }
            try { metrics.pmCompliance  = (() => {
                const total = db.prepare(`SELECT COUNT(*) as n FROM Schedule WHERE Active = 1 OR Active IS NULL`).get().n;
                const onTime = db.prepare(`SELECT COUNT(*) as n FROM Work WHERE TypeID IN (SELECT ID FROM WorkType WHERE Description LIKE '%PM%') AND CompDate <= SchDate AND CompDate IS NOT NULL`).get().n;
                return total > 0 ? parseFloat(((onTime / total) * 100).toFixed(1)) : null;
            })(); } catch { metrics.pmCompliance = null; }
            try { metrics.totalAssets   = db.prepare(`SELECT COUNT(*) as n FROM Asset`).get().n; } catch { metrics.totalAssets = null; }
            try { metrics.criticalAssets = db.prepare(`SELECT COUNT(*) as n FROM Asset WHERE Priority <= 2`).get().n; } catch { metrics.criticalAssets = null; }
            return metrics;
        };

        const live = getMetrics(liveDb, 'Live (Current Logic)');
        const sim  = getMetrics(simDb,  `Simulation (at ${session.cutoffDate})`);

        liveDb.close();
        simDb.close();

        // Compute deltas
        const deltas = {};
        ['openWOs', 'completedWOs', 'overdueWOs', 'pmSchedules', 'pmCompliance', 'totalAssets', 'criticalAssets'].forEach(k => {
            if (live[k] !== null && sim[k] !== null) {
                deltas[k] = parseFloat((live[k] - sim[k]).toFixed(2));
            }
        });

        res.json({ simId: req.params.simId, plantId: session.plantId, cutoffDate: session.cutoffDate, live, sim, deltas });
    } catch (err) {
        res.status(500).json({ error: 'Comparison failed: ' });
    }
});

// DELETE /api/studio/simulation/:simId
// Explicitly destroys a simulation session and its temp DB.
router.delete('/simulation/:simId', (req, res) => {
    const session = simSessions.get(req.params.simId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    simSessions.delete(req.params.simId);
    try { fs.unlinkSync(session.simPath); } catch {}
    res.json({ success: true });
});

// GET /api/studio/plants — list available plants for simulation plant picker
router.get('/plants', (req, res) => {
    try {
        const dataDir   = require('../resolve_data_dir');
        const plantsFile = path.join(dataDir, 'plants.json');
        const plants    = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));
        res.json({ plants: plants.map(p => ({ id: p.id, label: p.label })) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load plants: ' });
    }
});

module.exports = router;
