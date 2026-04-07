// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — Personal Intelligence Watchlist API
 * ================================================
 * Per-user follow/watch list for any item in the system — work orders,
 * assets, parts, vendors, sensors, contractors. Watched items surface in
 * the Personal Intelligence tile on Mission Control with live status updates.
 * Stored in auth.db (user_watchlist table) keyed by user_id from JWT.
 * Mounted at /api/watchlist in server/index.js (factory function pattern).
 *
 * FACTORY PATTERN: This module exports a function(authDb) rather than a
 * plain router. server/index.js calls require('./routes/watchlist')(authDb)
 * so the route has a direct reference to the auth database without going
 * through the database abstraction layer.
 *
 * ENDPOINTS:
 *   GET    /         List the current user's watched items (ordered by added_at DESC)
 *   POST   /         Watch an item (upsert — safe to call multiple times)
 *   DELETE /:id      Unwatch an item by watchlist row ID
 *
 * ITEM TYPES: work-order | asset | part | vendor | sensor | contractor | any future entity
 *   item_type + item_id together form the unique reference to the watched record.
 *   item_label is a human-readable name stored at watch-time for display.
 *   item_meta is a JSON blob for additional context (e.g. { plantId, status }).
 *
 * UNIQUENESS: UNIQUE(user_id, item_type, item_id) prevents duplicate watches.
 *   POST / uses INSERT OR IGNORE semantics, so it's safe to call on every page load.
 *
 * TABLE: auth.db → user_watchlist
 *   id, user_id, item_type, item_id, item_label, item_meta, added_at
 */
const express = require('express');
const router = express.Router();

module.exports = function(authDb) {
    // Ensure watchlist table exists
    authDb.exec(`
        CREATE TABLE IF NOT EXISTS user_watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            item_label TEXT NOT NULL,
            item_meta TEXT DEFAULT '{}',
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, item_type, item_id)
        )
    `);

    // GET /api/watchlist — get current user's watched items
    router.get('/', (req, res) => {
        try {
            const userId = req.userId || req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });

            const items = authDb.prepare(`
                SELECT id, item_type, item_id, item_label, item_meta, added_at
                FROM user_watchlist
                WHERE user_id = ?
                ORDER BY added_at DESC
            `).all(userId);

            // Parse meta JSON
            const parsed = items.map(i => ({
                ...i,
                item_meta: (() => { try { return JSON.parse(i.item_meta); } catch { return {}; } })()
            }));

            res.json({ items: parsed, count: parsed.length });
        } catch (err) {
            console.error('[Watchlist] GET error:', err.message);
            res.status(500).json({ error: 'Failed to fetch watchlist' });
        }
    });

    // POST /api/watchlist — add item to watchlist
    router.post('/', (req, res) => {
        try {
            const userId = req.userId || req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });

            const { itemType, itemId, itemLabel, itemMeta } = req.body;
            if (!itemType || !itemId || !itemLabel) {
                return res.status(400).json({ error: 'itemType, itemId, and itemLabel are required' });
            }

            const validTypes = ['work_order', 'asset', 'part', 'vendor', 'procedure', 'report'];
            if (!validTypes.includes(itemType)) {
                return res.status(400).json({ error: `Invalid item type. Must be: ${validTypes.join(', ')}` });
            }

            authDb.prepare(`
                INSERT OR IGNORE INTO user_watchlist (user_id, item_type, item_id, item_label, item_meta)
                VALUES (?, ?, ?, ?, ?)
            `).run(userId, itemType, String(itemId), itemLabel, JSON.stringify(itemMeta || {}));

            const count = authDb.prepare('SELECT COUNT(*) as c FROM user_watchlist WHERE user_id = ?').get(userId).c;
            res.json({ success: true, message: `Now watching: ${itemLabel}`, count });
        } catch (err) {
            console.error('[Watchlist] POST error:', err.message);
            res.status(500).json({ error: 'Failed to add to watchlist' });
        }
    });

    // DELETE /api/watchlist/:id — remove specific item
    router.delete('/:id', (req, res) => {
        try {
            const userId = req.userId || req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });

            const result = authDb.prepare('DELETE FROM user_watchlist WHERE id = ? AND user_id = ?').run(req.params.id, userId);
            if (result.changes === 0) return res.status(404).json({ error: 'Item not found' });

            const count = authDb.prepare('SELECT COUNT(*) as c FROM user_watchlist WHERE user_id = ?').get(userId).c;
            res.json({ success: true, count });
        } catch (err) {
            console.error('[Watchlist] DELETE error:', err.message);
            res.status(500).json({ error: 'Failed to remove from watchlist' });
        }
    });

    // DELETE /api/watchlist/item/:type/:itemId — remove by type+id combo
    router.delete('/item/:type/:itemId', (req, res) => {
        try {
            const userId = req.userId || req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });

            authDb.prepare('DELETE FROM user_watchlist WHERE user_id = ? AND item_type = ? AND item_id = ?')
                .run(userId, req.params.type, req.params.itemId);

            const count = authDb.prepare('SELECT COUNT(*) as c FROM user_watchlist WHERE user_id = ?').get(userId).c;
            res.json({ success: true, count });
        } catch (err) {
            console.error('[Watchlist] DELETE item error:', err.message);
            res.status(500).json({ error: 'Failed to unwatch item' });
        }
    });

    // GET /api/watchlist/check/:type/:itemId — check if user is watching a specific item
    router.get('/check/:type/:itemId', (req, res) => {
        try {
            const userId = req.userId || req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });

            const item = authDb.prepare(
                'SELECT id FROM user_watchlist WHERE user_id = ? AND item_type = ? AND item_id = ?'
            ).get(userId, req.params.type, req.params.itemId);

            res.json({ watching: !!item, watchId: item?.id || null });
        } catch (err) {
            res.status(500).json({ error: 'Check failed' });
        }
    });

    return router;
};
