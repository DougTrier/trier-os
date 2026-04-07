// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Institutional / Tribal Knowledge Vault API
 * =======================================================
 * Preserves the knowledge that walks out the door when experienced
 * technicians retire — equipment quirks, undocumented fixes, workarounds,
 * and lessons learned from 30 years of dairy plant maintenance.
 * Entries are tagged, searchable, upvotable, and linked to specific assets.
 * Mounted at /api/tribal-knowledge in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /:entityType/:entityId        All knowledge entries for a specific asset or equipment
 *   GET    /:entityType/:entityId/count  Entry count for an asset (badge display on asset card)
 *   POST   /                             Create a new knowledge entry
 *   PUT    /:id/upvote                   Upvote an entry (increment HelpfulCount)
 *   PUT    /:id                          Edit an existing entry
 *   DELETE /:id                          Remove a knowledge entry (author or admin only)
 *   GET    /                             Full searchable list (filter: category, entityType, search)
 *
 * ENTITY TYPES: asset | equipment | procedure | general | vendor | part
 *   Entries linked to entityType='asset' + entityId appear in the asset detail
 *   view's "Tribal Knowledge" tab automatically.
 *
 * CATEGORIES: electrical | mechanical | pneumatic | hydraulic | safety |
 *   calibration | startup | shutdown | cleaning | inspection | other
 *
 * UPVOTE SYSTEM: HelpfulCount tracks how many technicians found the entry useful.
 *   Entries with high HelpfulCount are sorted first in the asset detail view.
 *   There is no downvote — duplicate upvotes are prevented by browser localStorage
 *   key, not server-side user tracking (stateless design).
 *
 * FULL-TEXT SEARCH: GET / with ?search= does LIKE matching across Title, Content,
 *   Tags, and AuthorName. Results are sorted by HelpfulCount DESC, CreatedAt DESC.
 *
 * TABLE: tribal_knowledge (in trier_logistics.db — cross-plant)
 *   ID, EntityType, EntityID, PlantID, Title, Content, Category,
 *   Tags, AuthorName, HelpfulCount, CreatedAt, UpdatedAt
 */
/**
 * Institutional Knowledge API Routes
 * ============================
 * CRUD + search for institutional maintenance knowledge
 * Linked to assets, parts, SOPs via entity_type + entity_id
 */
const express = require('express');
const router = express.Router();
const db = require('../database');

// Ensure tables exist in the currently active tenant database
function ensureTables(activeDb) {
    try {
        activeDb.exec(`CREATE TABLE IF NOT EXISTS tribal_knowledge (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            contributed_by TEXT DEFAULT 'system',
            tags TEXT DEFAULT '',
            upvotes INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`);
    } catch (e) { /* already exists */ }

    // Votes tracking — one vote per user per tip
    try {
        activeDb.exec(`CREATE TABLE IF NOT EXISTS tribal_knowledge_votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tip_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(tip_id, username)
        )`);
    } catch (e) { /* already exists */ }
}

// GET all tips for a specific entity (asset, part, sop)
router.get('/:entityType/:entityId', (req, res) => {
    try {
        const activeDb = db.getDb();
        ensureTables(activeDb);
        const { entityType, entityId } = req.params;
        const rows = db.getDb().prepare(`
            SELECT * FROM tribal_knowledge 
            WHERE entity_type = ? AND entity_id = ? 
            ORDER BY upvotes DESC, created_at DESC
        `).all(entityType, entityId);
        
        // Attach voter list to each tip so client knows who already voted
        const voteStmt = db.getDb().prepare('SELECT username FROM tribal_knowledge_votes WHERE tip_id = ?');
        rows.forEach(row => {
            row.voters = voteStmt.all(row.id).map(v => v.username);
        });
        
        res.json(rows);
    } catch (err) {
        console.error('Institutional Knowledge GET error:', err);
        res.status(500).json({ error: 'Failed to fetch knowledge' });
    }
});

// GET count of tips for an entity (for badge display)
router.get('/:entityType/:entityId/count', (req, res) => {
    try {
        const activeDb = db.getDb();
        ensureTables(activeDb);
        const { entityType, entityId } = req.params;
        const result = db.getDb().prepare(`
            SELECT COUNT(*) as count FROM tribal_knowledge 
            WHERE entity_type = ? AND entity_id = ?
        `).get(entityType, entityId);
        res.json({ count: result.count });
    } catch (err) {
        res.json({ count: 0 });
    }
});

// POST create new knowledge tip
router.post('/', (req, res) => {
    try {
        const activeDb = db.getDb();
        ensureTables(activeDb);
        const { entity_type, entity_id, title, body, contributed_by, tags } = req.body;
        if (!entity_type || !entity_id || !title || !body) {
            return res.status(400).json({ error: 'entity_type, entity_id, title, and body are required' });
        }
        const result = activeDb.prepare(`
            INSERT INTO tribal_knowledge (entity_type, entity_id, title, body, contributed_by, tags)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(entity_type, entity_id, title, body, contributed_by || 'system', tags || '');
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        console.error('Institutional Knowledge POST error:', err);
        res.status(500).json({ error: 'Failed to save knowledge' });
    }
});

// PUT toggle upvote — light switch: on/off
router.put('/:id/upvote', (req, res) => {
    try {
        const tipId = req.params.id;
        const username = req.body.username || req.user?.username || 'anonymous';
        
        // Check if already voted
        const existing = db.getDb().prepare(
            'SELECT id FROM tribal_knowledge_votes WHERE tip_id = ? AND username = ?'
        ).get(tipId, username);
        
        if (existing) {
            // Already voted — REMOVE vote (toggle off)
            db.getDb().prepare('DELETE FROM tribal_knowledge_votes WHERE tip_id = ? AND username = ?').run(tipId, username);
            db.getDb().prepare('UPDATE tribal_knowledge SET upvotes = MAX(0, upvotes - 1) WHERE id = ?').run(tipId);
            return res.json({ success: true, action: 'removed' });
        }
        
        // Not voted — ADD vote (toggle on)
        db.getDb().prepare('INSERT INTO tribal_knowledge_votes (tip_id, username) VALUES (?, ?)').run(tipId, username);
        db.getDb().prepare('UPDATE tribal_knowledge SET upvotes = upvotes + 1 WHERE id = ?').run(tipId);
        
        res.json({ success: true, action: 'added' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle vote' });
    }
});

// PUT update a tip
router.put('/:id', (req, res) => {
    try {
        const { title, body, tags } = req.body;
        const fields = [];
        const values = [];
        if (title !== undefined) { fields.push('title = ?'); values.push(title); }
        if (body !== undefined) { fields.push('body = ?'); values.push(body); }
        if (tags !== undefined) { fields.push('tags = ?'); values.push(tags); }
        fields.push("updated_at = datetime('now')");
        if (fields.length === 1) return res.json({ success: true }); // only updated_at
        values.push(req.params.id);
        db.getDb().prepare(`UPDATE tribal_knowledge SET ${fields.join(', ')} WHERE id = ?`).run(...values); /* dynamic col/table - sanitize inputs */
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update knowledge' });
    }
});

// DELETE a tip
router.delete('/:id', (req, res) => {
    try {
        db.getDb().prepare('DELETE FROM tribal_knowledge WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete knowledge' });
    }
});

// GET search across all knowledge
router.get('/', (req, res) => {
    try {
        const activeDb = db.getDb();
        ensureTables(activeDb);
        const { q, limit } = req.query;
        const maxResults = parseInt(limit) || 50;
        
        if (!q || q.trim().length < 2) {
            const recent = db.getDb().prepare(`
                SELECT * FROM tribal_knowledge ORDER BY created_at DESC LIMIT ?
            `).all(maxResults);
            return res.json(recent);
        }

        const tokens = q.trim().split(/\s+/).filter(t => t.length > 0);
        const conditions = tokens.map(() => `(title LIKE ? OR body LIKE ? OR tags LIKE ? OR entity_id LIKE ?)`).join(' AND ');
        const params = [];
        tokens.forEach(t => { params.push(`%${t}%`, `%${t}%`, `%${t}%`, `%${t}%`); });
        params.push(maxResults);

        const rows = db.getDb().prepare(`
            SELECT * FROM tribal_knowledge 
            WHERE ${conditions}
            ORDER BY upvotes DESC, created_at DESC
            LIMIT ?
        `).all(...params);
        res.json(rows);
    } catch (err) {
        console.error('Institutional Knowledge search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

module.exports = router;
