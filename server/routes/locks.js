// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Record Lock Routes
 * ========================================
 * Prevents two users from editing the same work order (or other record)
 * simultaneously. Locks are per-record, auto-expire after 15 minutes,
 * and are released on save, cancel, or close.
 *
 * ENDPOINTS:
 *   POST   /api/locks/acquire   — Attempt to lock a record
 *   POST   /api/locks/release   — Release a lock you hold
 *   GET    /api/locks/check/:type/:id — Check if a record is locked
 *   POST   /api/locks/heartbeat — Extend your lock (prevents timeout during long edits)
 */

const express = require('express');
const router = express.Router();
const dbModule = require('../database');

// Locks must always use a writable DB — the default context may be 'all_sites'
// which opens as readonly. Always use the home plant's writable handle.
function getWritableDb() {
    const plantId = dbModule.asyncLocalStorage.getStore() || 'Demo_Plant_1';
    // 'all_sites' is readonly — fall back to Demo_Plant_1 for lock storage
    return dbModule.getDb(plantId === 'all_sites' ? 'Demo_Plant_1' : plantId);
}

const LOCK_DURATION_MINUTES = 5;

// Purge ALL locks on server startup — if the server restarted, no one is editing
try {
    getWritableDb().prepare(`DELETE FROM record_locks`).run();
    console.log('🔓 [Locks] Cleared all stale locks on startup');
} catch (e) { /* table may not exist yet */ }

// Clean expired locks (called before every operation)
function cleanExpired() {
    try {
        const now = new Date().toISOString();
        getWritableDb().prepare(`DELETE FROM record_locks WHERE expires_at < ?`).run(now);
    } catch (e) { /* table may not exist yet on first boot */ }
}

// ── POST /api/locks/acquire ──────────────────────────────────────────────
// Try to lock a record. Returns { locked: true } or { locked: false, lockedBy, lockedAt }
router.post('/acquire', (req, res) => {
    try {
        cleanExpired();
        const { recordType = 'work_order', recordId, userName } = req.body;

        if (!recordId || !userName) {
            return res.status(400).json({ error: 'recordId and userName are required' });
        }

        // Check for existing lock
        const existing = getWritableDb().prepare(
            `SELECT locked_by, locked_at, expires_at FROM record_locks WHERE record_type = ? AND record_id = ?`
        ).get(recordType, String(recordId));

        if (existing) {
            // If the same user already holds the lock, extend it
            if (existing.locked_by === userName) {
                const newExpiry = new Date(Date.now() + LOCK_DURATION_MINUTES * 60000).toISOString();
                getWritableDb().prepare(
                    `UPDATE record_locks SET expires_at = ?, locked_at = datetime('now') WHERE record_type = ? AND record_id = ?`
                ).run(newExpiry, recordType, String(recordId));
                return res.json({ locked: true, message: 'Lock extended' });
            }

            // Someone else holds the lock
            return res.json({
                locked: false,
                lockedBy: existing.locked_by,
                lockedAt: existing.locked_at,
                expiresAt: existing.expires_at,
                message: `${existing.locked_by} is currently editing this record.`
            });
        }

        // No existing lock — acquire it
        const expiresAt = new Date(Date.now() + LOCK_DURATION_MINUTES * 60000).toISOString();
        getWritableDb().prepare(
            `INSERT INTO record_locks (record_type, record_id, locked_by, locked_at, expires_at) VALUES (?, ?, ?, datetime('now'), ?)`
        ).run(recordType, String(recordId), userName, expiresAt);

        res.json({ locked: true, message: 'Lock acquired', expiresAt });
    } catch (err) {
        console.error('POST /api/locks/acquire error:', err);
        res.status(500).json({ error: 'Failed to acquire lock' });
    }
});

// ── POST /api/locks/release ──────────────────────────────────────────────
// Release a lock. Only the holder can release it.
router.post('/release', (req, res) => {
    try {
        const { recordType = 'work_order', recordId, userName } = req.body;

        if (!recordId) {
            return res.status(400).json({ error: 'recordId is required' });
        }

        // Delete the lock only if held by this user (or if no userName provided, release anyway)
        if (userName) {
            getWritableDb().prepare(
                `DELETE FROM record_locks WHERE record_type = ? AND record_id = ? AND locked_by = ?`
            ).run(recordType, String(recordId), userName);
        } else {
            getWritableDb().prepare(
                `DELETE FROM record_locks WHERE record_type = ? AND record_id = ?`
            ).run(recordType, String(recordId));
        }

        res.json({ released: true });
    } catch (err) {
        console.error('POST /api/locks/release error:', err);
        res.status(500).json({ error: 'Failed to release lock' });
    }
});

// ── GET /api/locks/check/:type/:id ───────────────────────────────────────
// Check if a record is locked (does NOT modify anything)
router.get('/check/:type/:id', (req, res) => {
    try {
        cleanExpired();
        const { type, id } = req.params;

        const lock = getWritableDb().prepare(
            `SELECT locked_by, locked_at, expires_at FROM record_locks WHERE record_type = ? AND record_id = ?`
        ).get(type, String(id));

        if (lock) {
            res.json({
                isLocked: true,
                lockedBy: lock.locked_by,
                lockedAt: lock.locked_at,
                expiresAt: lock.expires_at
            });
        } else {
            res.json({ isLocked: false });
        }
    } catch (err) {
        console.error('GET /api/locks/check error:', err);
        res.status(500).json({ error: 'Failed to check lock' });
    }
});

// ── POST /api/locks/heartbeat ────────────────────────────────────────────
// Extend a lock's expiry (call every few minutes during editing)
router.post('/heartbeat', (req, res) => {
    try {
        const { recordType = 'work_order', recordId, userName } = req.body;

        if (!recordId || !userName) {
            return res.status(400).json({ error: 'recordId and userName are required' });
        }

        const newExpiry = new Date(Date.now() + LOCK_DURATION_MINUTES * 60000).toISOString();
        const result = getWritableDb().prepare(
            `UPDATE record_locks SET expires_at = ? WHERE record_type = ? AND record_id = ? AND locked_by = ?`
        ).run(newExpiry, recordType, String(recordId), userName);

        if (result.changes > 0) {
            res.json({ extended: true, expiresAt: newExpiry });
        } else {
            res.json({ extended: false, message: 'Lock not found or held by another user' });
        }
    } catch (err) {
        console.error('POST /api/locks/heartbeat error:', err);
        res.status(500).json({ error: 'Failed to extend lock' });
    }
});

module.exports = router;
