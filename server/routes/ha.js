// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — High Availability (HA) Replication API
 * ===================================================
 * Server-to-server database replication with manual failover, consistency
 * checking, snapshot rollback, and secondary health monitoring.
 * Mounted at /api/ha in server/index.js.
 * Business logic lives in server/ha_sync.js.
 *
 * ENDPOINTS:
 *   GET  /health              Secondary→Primary health probe (requires HA_SYNC_KEY)
 *   GET  /status              Current HA mode (primary/secondary/standalone) + lag stats
 *   GET  /secondary-health    Primary probes its secondary and returns { alive, lag }
 *   GET  /consistency         Compare row counts across primary and secondary databases
 *   POST /sync-now            Trigger immediate full sync push to secondary
 *   POST /consistency-check   Run consistency check and auto-repair diverged tables
 *   GET  /snapshots           List available snapshot files with timestamps + sizes
 *   POST /rollback            Roll back the primary to a named snapshot
 *   POST /promote             Promote secondary to primary (manual failover)
 *   GET  /config              Current HA configuration (secondary URL, sync interval)
 *   PUT  /config              Update HA configuration
 *   POST /config/generate-key Generate a new cryptographic HA_SYNC_KEY
 *   POST /config/import-key   Import an existing HA_SYNC_KEY (e.g. from primary)
 *
 * AUTHENTICATION:
 *   - Browser users: standard JWT (for /status, /config, /rollback, /promote)
 *   - Server-to-server: HA_SYNC_KEY header (for /health, /sync-now internally)
 *     The sync key is a 64-char hex secret set in .env as HA_SYNC_KEY.
 *
 * REPLICATION DESIGN:
 *   Primary pushes a full SQLite page-level backup to secondary every N minutes
 *   (default 60s). The secondary is always a read replica — it does not accept
 *   writes from clients. Promotion (POST /promote) switches the secondary to
 *   accept writes and updates its own config to mark itself as primary.
 *
 * SNAPSHOT ROLLBACK: Snapshots are timestamped .db copies stored in data/snapshots/.
 *   POST /rollback stops the DB, copies the snapshot over the live DB, and restarts.
 *   Used for one-click "undo the last migration" or "restore before bad import".
 *
 * CONSISTENCY MODEL: /consistency checks row counts and checksums per table.
 *   Diverged tables are flagged with { table, primaryCount, secondaryCount, diverged }.
 *   POST /consistency-check auto-repairs by re-pushing diverged tables to secondary.
 */
const express = require('express');
const router = express.Router();
const db = require('../database');
const haSync = require('../ha_sync');

// Sync key middleware for server-to-server calls
function requireSyncKey(req, res, next) {
    const syncKey = req.headers['x-sync-key'];
    if (!haSync.validateSyncKey(syncKey)) {
        return res.status(403).json({ error: 'Invalid sync key' });
    }
    next();
}

// ── Health Check (sync-key only, no JWT) ──────────────────────────────────
router.get('/health', requireSyncKey, (req, res) => {
    res.json({
        status: 'ok',
        serverId: haSync.SERVER_ID,
        role: haSync.SERVER_ROLE,
        serverTime: new Date().toISOString(),
        port: process.env.PORT || 3000
    });
});

// ── Replication Status ───────────────────────────────────────────────────
router.get('/status', (req, res) => {
    try {
        const status = haSync.getReplicationStatus();
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get HA status' });
    }
});

// ── Check Secondary Health ───────────────────────────────────────────────
router.get('/secondary-health', async (req, res) => {
    try {
        const health = await haSync.checkSecondaryHealth();
        res.json(health);
    } catch (err) {
        res.status(500).json({ error: 'Health check failed' });
    }
});

// ── Consistency Check (server-to-server) ─────────────────────────────────
router.get('/consistency', (req, res) => {
    const syncKey = req.headers['x-sync-key'];
    if (syncKey && !haSync.validateSyncKey(syncKey)) {
        return res.status(403).json({ error: 'Invalid sync key' });
    }

    const plantId = req.query.plantId;
    if (!plantId) return res.status(400).json({ error: 'plantId required' });

    try {
        const plantDb = db.getDb(plantId);
        const counts = {};
        for (const table of haSync.TRACKED_TABLES) {
            try {
                counts[table] = plantDb.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get().c; /* dynamic col/table - sanitize inputs */
            } catch (e) { counts[table] = -1; }
        }
        res.json({ plantId, counts, serverTime: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Force Sync Now (admin trigger) ───────────────────────────────────────
router.post('/sync-now', async (req, res) => {
    try {
        const result = await haSync.pushChangesToSecondary();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: 'Sync failed', detail: err.message });
    }
});

// ── Run Consistency Check Against Secondary ──────────────────────────────
router.post('/consistency-check', async (req, res) => {
    try {
        const { plantId } = req.body;
        if (!plantId) return res.status(400).json({ error: 'plantId required' });
        const result = await haSync.consistencyCheck(plantId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Snapshot & Rollback (Task 4.10) ──────────────────────────────────────
router.get('/snapshots', (req, res) => {
    const { plantId } = req.query;
    try {
        const snapshots = haSync.listSnapshots(plantId);
        res.json({ snapshots });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/rollback', (req, res) => {
    const { plantId, snapshotFile } = req.body;
    if (!plantId) return res.status(400).json({ error: 'plantId required' });
    try {
        const result = haSync.rollbackToSnapshot(plantId, snapshotFile);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Manual Failover (Task 4.3) ───────────────────────────────────────────
router.post('/promote', async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Admin password required for failover' });

    // Verify the user's password (they must be admin/creator)
    try {
        const bcrypt = require('bcryptjs');
        const authDb = require('../auth_db');
        const username = req.user?.fullName || req.user?.username;
        if (!username) return res.status(401).json({ error: 'Must be logged in' });

        const user = authDb.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) return res.status(403).json({ error: 'User not found' });
        if (user.role !== 'admin' && user.role !== 'creator') {
            return res.status(403).json({ error: 'Only admin/creator can perform failover' });
        }

        const match = bcrypt.compareSync(password, user.password);
        if (!match) return res.status(403).json({ error: 'Incorrect password' });

        // Perform the role swap
        const currentRole = haSync.SERVER_ROLE;
        const newRole = currentRole === 'primary' ? 'secondary' : 'primary';

        // Save new role to SystemSettings
        const logDb = require('../logistics_db').db;
        logDb.exec(`CREATE TABLE IF NOT EXISTS SystemSettings (
            key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now'))
        )`);
        logDb.prepare(`INSERT OR REPLACE INTO SystemSettings (key, value, updated_at) VALUES (?, ?, datetime('now'))`)
            .run('ha_role', newRole);

        // Log the failover event
        console.log(`  ⚠️ [HA] FAILOVER: Role changed from [${currentRole}] → [${newRole}] by ${username}`);

        res.json({
            success: true,
            message: `Role changed from ${currentRole} to ${newRole}. Restart the server for changes to take effect.`,
            previousRole: currentRole,
            newRole,
            promotedBy: username,
            timestamp: new Date().toISOString(),
            restartRequired: true
        });
    } catch (err) {
        res.status(500).json({ error: 'Failover failed', detail: err.message });
    }
});

// ── HA Config Management (UI-driven) ─────────────────────────────────────
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Helper: get/set config from logistics DB
function getHAConfig() {
    try {
        const logDb = require('../logistics_db').db;
        // Ensure SystemSettings table exists
        logDb.exec(`CREATE TABLE IF NOT EXISTS SystemSettings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        )`);
        const rows = logDb.prepare(`SELECT key, value FROM SystemSettings WHERE key LIKE 'ha_%'`).all();
        const config = {};
        for (const row of rows) {
            config[row.key.replace('ha_', '')] = row.value;
        }
        return config;
    } catch (err) {
        console.error('[HA Config] Read error:', err.message);
        return {};
    }
}

function setHAConfig(key, value) {
    try {
        const logDb = require('../logistics_db').db;
        logDb.exec(`CREATE TABLE IF NOT EXISTS SystemSettings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        )`);
        logDb.prepare(`INSERT OR REPLACE INTO SystemSettings (key, value, updated_at) VALUES (?, ?, datetime('now'))`)
            .run(`ha_${key}`, value);
    } catch (err) {
        console.error('[HA Config] Write error:', err.message);
    }
}

// GET config
router.get('/config', (req, res) => {
    const config = getHAConfig();
    const dataDir = require('../resolve_data_dir');
    const syncKeyPath = path.join(dataDir, '.sync_key');
    const hasPairingKey = fs.existsSync(syncKeyPath) && fs.readFileSync(syncKeyPath, 'utf8').trim().length > 0;
    
    res.json({
        role: config.role || haSync.SERVER_ROLE,
        partnerAddress: config.partnerAddress || (haSync.SERVER_ROLE === 'primary' ? haSync.SECONDARY_URL : haSync.PRIMARY_URL),
        serverId: haSync.SERVER_ID,
        hasPairingKey,
        serverRole: haSync.SERVER_ROLE,
        syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || '60000', 10)
    });
});

// PUT config — save role and partner address
router.put('/config', (req, res) => {
    const { role, partnerAddress } = req.body;
    if (role && ['primary', 'secondary'].includes(role)) {
        setHAConfig('role', role);
    }
    if (partnerAddress) {
        setHAConfig('partnerAddress', partnerAddress);
    }
    res.json({ success: true, message: 'Configuration saved. Restart server for role changes to take effect.' });
});

// POST generate-key — creates a new pairing key (Primary only)
router.post('/config/generate-key', (req, res) => {
    try {
        const key = crypto.randomBytes(32).toString('hex');
        const dataDir = require('../resolve_data_dir');
        const syncKeyPath = path.join(dataDir, '.sync_key');
        fs.writeFileSync(syncKeyPath, key);
        setHAConfig('pairingKeyCreated', new Date().toISOString());
        console.log('  🔑 [HA] New pairing key generated via admin UI');
        res.json({ success: true, key });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate key', detail: err.message });
    }
});

// POST import-key — saves a pairing key received from the master (Secondary only)
router.post('/config/import-key', (req, res) => {
    const { key } = req.body;
    if (!key || typeof key !== 'string' || key.length < 16) {
        return res.status(400).json({ error: 'Invalid pairing key. Must be at least 16 characters.' });
    }
    try {
        const dataDir = require('../resolve_data_dir');
        const syncKeyPath = path.join(dataDir, '.sync_key');
        fs.writeFileSync(syncKeyPath, key.trim());
        setHAConfig('pairingKeyImported', new Date().toISOString());
        console.log('  🔑 [HA] Pairing key imported from master via admin UI');
        res.json({ success: true, message: 'Pairing key imported successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to import key', detail: err.message });
    }
});

module.exports = router;
