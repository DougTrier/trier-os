// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Migration 018 — Tribal Knowledge Tables
 * ===========================================================
 * Creates TK_Posts, TK_Comments, TK_Tags tables for the Tribal Knowledge Vault.
 */
/**
 * 018_tribal_knowledge.js
 * Creates the tribal_knowledge table for storing institutional maintenance knowledge
 * linked to assets, parts, SOPs, and other entities.
 */

module.exports = {
    up: (db) => {
        try {
            db.exec(`CREATE TABLE IF NOT EXISTS tribal_knowledge (
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
            console.log('   -> Created tribal_knowledge table');
        } catch (err) {
            if (!err.message.includes('already exists')) {
                console.warn('   -> tribal_knowledge migration warning:', err.message);
            }
        }
    }
};
