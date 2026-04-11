// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Translation Cache Database
 * Global SQLite store for all translated content.
 * Keyed by SHA-256(text+lang) — never re-translates identical strings.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const dataDir = require('./resolve_data_dir');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'translations.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000'); // Wait up to 5s on lock contention instead of throwing immediately

db.exec(`
    CREATE TABLE IF NOT EXISTS translation_cache (
        hash        TEXT NOT NULL,
        lang        TEXT NOT NULL,
        translated  TEXT NOT NULL,
        created_at  INTEGER DEFAULT (strftime('%s','now')),
        PRIMARY KEY (hash, lang)
    );
    CREATE TABLE IF NOT EXISTS translation_audit (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        hash        TEXT NOT NULL,
        lang        TEXT NOT NULL,
        source_text TEXT,
        char_count  INTEGER,
        provider    TEXT DEFAULT 'google',
        created_at  INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cache_lang ON translation_cache(lang);
    CREATE INDEX IF NOT EXISTS idx_audit_lang ON translation_audit(lang, created_at);
`);

const stmts = {
    get:   db.prepare('SELECT translated FROM translation_cache WHERE hash = ? AND lang = ?'),
    set:   db.prepare('INSERT OR REPLACE INTO translation_cache (hash, lang, translated) VALUES (?, ?, ?)'),
    audit: db.prepare('INSERT INTO translation_audit (hash, lang, source_text, char_count) VALUES (?, ?, ?, ?)'),
    stats: db.prepare('SELECT lang, COUNT(*) as n FROM translation_cache GROUP BY lang'),
    total: db.prepare('SELECT COUNT(*) as n FROM translation_cache'),
    chars: db.prepare('SELECT SUM(char_count) as chars FROM translation_audit'),
};

module.exports = {
    get:   (hash, lang) => { const r = stmts.get.get(hash, lang); return r ? r.translated : null; },
    set:   (hash, lang, text) => stmts.set.run(hash, lang, text),
    audit: (hash, lang, src)  => stmts.audit.run(hash, lang, src.slice(0, 500), src.length),
    stats: () => ({ total: stmts.total.get().n, byLang: stmts.stats.all(), chars: stmts.chars.get().chars || 0 }),
    db,
};
