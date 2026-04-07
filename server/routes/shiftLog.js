// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Shift Handoff Digital Logbook
 * =========================================
 * Replaces the beat-up paper notebook at the desk with a structured,
 * timestamped, searchable shift log. Built for gloves-on industrial use.
 * Stored in trier_logistics.db so logs are cross-plant visible.
 * Mounted at /api/shift-log in server/index.js.
 *
 * ENDPOINTS:
 *   GET    /         List shift log entries (filtered by plant_id via x-plant-id header)
 *   POST   /         Create a new log entry (profanity-filtered, auto-timestamped)
 *   PUT    /:id      Edit an existing entry (same-day only unless IT Admin / Creator)
 *   DELETE /:id      Delete entry (IT Admin / Creator only, or author same-day)
 *   POST   /lock     Bulk-lock all unlocked entries for a plant (end-of-shift lockdown)
 *
 * EDIT RESTRICTION: Technicians may only edit their own entries and only on the
 * same calendar day they were created. After midnight, the entry is effectively
 * read-only for regular users. IT Admin and Creator roles bypass this restriction.
 *
 * PROFANITY FILTER: All message text is run through filterProfanity() before
 * write. Offensive words are replaced with '***'. The filter is case-insensitive
 * and uses word-boundary matching to avoid false positives (e.g. "class" ≠ "ass").
 *
 * LOCKING: POST /lock sets locked=1 on all current-plant unlocked entries.
 * Locked entries cannot be edited or deleted by any user role. This is used
 * at end-of-shift to create an immutable handoff record. Unlocking requires
 * direct DB access (intentional — no UI unlock path).
 *
 * TABLE: shift_log
 *   id, plant_id, username, message, created_at, updated_at, locked
 */
const express = require('express');
const router = express.Router();
const logisticsDb = require('../logistics_db').db;

// ── Table Initialization ─────────────────────────────────────────────────
try {
    logisticsDb.exec(`CREATE TABLE IF NOT EXISTS shift_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id TEXT NOT NULL,
        username TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT,
        locked INTEGER DEFAULT 0
    )`);
    // Add columns if table exists without them
    try { logisticsDb.exec('ALTER TABLE shift_log ADD COLUMN locked INTEGER DEFAULT 0'); } catch(e) { /* Migration: column may already exist */ }
    try { logisticsDb.exec('ALTER TABLE shift_log ADD COLUMN updated_at TEXT'); } catch(e) { /* Migration: column may already exist */ }
} catch(e) { console.warn('[ShiftLog] Table init warning:', e.message); }

// ── Profanity Filter ─────────────────────────────────────────────────────
const PROFANITY_LIST = [
    'fuck','shit','damn','ass','bitch','bastard','dick','cock','pussy','cunt',
    'hell','crap','piss','fag','slut','whore','nigger','nigga','retard',
    'douche','jackass','motherfucker','bullshit','horseshit','goddamn',
    'asshole','dumbass','dipshit','shithead','fucker','fucking','fucked',
    'shitting','pissed','dammit','damnit','wtf','stfu','lmfao','smfh',
    'twat','wanker','bollocks','tosser','arse','arsehole','bloody hell',
    'sob','sonofabitch','pos','mf','af','bs'
];

function filterProfanity(text) {
    if (!text) return text;
    let filtered = text;
    PROFANITY_LIST.forEach(word => {
        const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        filtered = filtered.replace(regex, '****');
    });
    return filtered;
}

// GET shift log entries for a plant (supports date range + keyword search)
router.get('/', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const limit = parseInt(req.query.limit) || 100;
        const { from_date, to_date, search, shift } = req.query;

        let sql = 'SELECT * FROM shift_log WHERE plant_id = ?';
        const params = [plantId];

        if (from_date) {
            sql += ' AND created_at >= ?';
            params.push(from_date);
        }
        if (to_date) {
            // Add time to make it inclusive of the entire end date
            sql += ' AND created_at <= ?';
            params.push(to_date + 'T23:59:59');
        }
        if (search && search.trim()) {
            sql += ' AND (message LIKE ? OR username LIKE ?)';
            params.push(`%${search.trim()}%`, `%${search.trim()}%`);
        }
        // Feature 6.2 (Shift Boundary Audit): Rigid time-slice isolation
        if (shift === '1') {
            sql += " AND CAST(strftime('%H', datetime(created_at, 'localtime')) AS INTEGER) >= 7 AND CAST(strftime('%H', datetime(created_at, 'localtime')) AS INTEGER) < 15";
        } else if (shift === '2') {
            sql += " AND CAST(strftime('%H', datetime(created_at, 'localtime')) AS INTEGER) >= 15 AND CAST(strftime('%H', datetime(created_at, 'localtime')) AS INTEGER) < 23";
        } else if (shift === '3') {
            sql += " AND (CAST(strftime('%H', datetime(created_at, 'localtime')) AS INTEGER) >= 23 OR CAST(strftime('%H', datetime(created_at, 'localtime')) AS INTEGER) < 7)";
        }

        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const rows = logisticsDb.prepare(sql).all(...params);
        res.json(rows.reverse()); // Oldest first for chat-like display
    } catch (err) {
        console.error('GET /api/shift-log error:', err);
        res.status(500).json({ error: 'Failed to fetch shift log' });
    }
});

// POST new shift log entry (auto-save from frontend)
router.post('/', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const { username, message } = req.body;
        if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });
        if (!username) return res.status(400).json({ error: 'Username is required' });
        
        const cleanMessage = filterProfanity(message.trim());
        const now = new Date().toISOString();
        
        const result = logisticsDb.prepare(`
            INSERT INTO shift_log (plant_id, username, message, created_at, updated_at, locked) 
            VALUES (?, ?, ?, ?, ?, 0)
        `).run(plantId, username, cleanMessage, now, now);
        
        res.status(201).json({ 
            success: true, 
            id: result.lastInsertRowid,
            entry: {
                id: result.lastInsertRowid,
                plant_id: plantId,
                username,
                message: cleanMessage,
                created_at: now,
                updated_at: now,
                locked: 0
            }
        });
    } catch (err) {
        console.error('POST /api/shift-log error:', err);
        res.status(500).json({ error: 'Failed to save log entry' });
    }
});

// PUT update existing entry (same-day, same-user only unless admin)
router.put('/:id', (req, res) => {
    try {
        const { username, message } = req.body;
        const entry = logisticsDb.prepare('SELECT * FROM shift_log WHERE id = ?').get(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Entry not found' });
        
        // Check permissions: same user + same day, OR admin
        // SECURITY: Derive role from JWT (req.user), NOT from client-supplied headers
        const globalRole = req.user?.globalRole || '';
        const isCreator = globalRole === 'creator' || req.user?.isCreator === true;
        const isAdmin = globalRole === 'it_admin' || isCreator;
        
        if (!isAdmin) {
            if (entry.username !== username) {
                return res.status(403).json({ error: 'You can only edit your own entries' });
            }
            if (entry.locked) {
                return res.status(403).json({ error: 'This entry is locked and cannot be edited' });
            }
            // Same-day check
            const entryDate = new Date(entry.created_at).toDateString();
            const today = new Date().toDateString();
            if (entryDate !== today) {
                return res.status(403).json({ error: 'Entries can only be edited on the same day they were created' });
            }
        }
        
        const cleanMessage = filterProfanity(message.trim());
        const now = new Date().toISOString();
        
        logisticsDb.prepare('UPDATE shift_log SET message = ?, updated_at = ? WHERE id = ?')
            .run(cleanMessage, now, req.params.id);
        
        res.json({ success: true, message: cleanMessage });
    } catch (err) {
        console.error('PUT /api/shift-log error:', err);
        res.status(500).json({ error: 'Failed to update entry' });
    }
});

// DELETE entry (admin/creator only)
router.delete('/:id', (req, res) => {
    try {
        // SECURITY: Derive role from JWT (req.user), NOT from client-supplied headers
        const globalRole = req.user?.globalRole || '';
        const isCreator = globalRole === 'creator' || req.user?.isCreator === true;
        
        if (globalRole !== 'it_admin' && !isCreator) {
            return res.status(403).json({ error: 'Only administrators can delete log entries' });
        }
        
        logisticsDb.prepare('DELETE FROM shift_log WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/shift-log error:', err);
        res.status(500).json({ error: 'Failed to delete entry' });
    }
});

// POST lock entries (called on logout — locks all unlocked entries for this user/plant)
router.post('/lock', (req, res) => {
    try {
        const plantId = req.headers['x-plant-id'] || 'Demo_Plant_1';
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username required' });
        
        const result = logisticsDb.prepare(`
            UPDATE shift_log SET locked = 1 
            WHERE plant_id = ? AND username = ? AND locked = 0
        `).run(plantId, username);
        
        res.json({ success: true, locked: result.changes });
    } catch (err) {
        res.status(500).json({ error: 'Failed to lock entries' });
    }
});

module.exports = router;
